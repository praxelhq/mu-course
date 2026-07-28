import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

// THE outbound-fetch policy module (KTD19). Every fetch of a user-supplied
// URL — link checks, graders, portfolio crawlers — goes through safeFetch.
// No raw fetch of user input anywhere else (CLAUDE.md invariant).
//
// Policy:
//   - http(s) only.
//   - The hostname (literal IP, or every DNS A/AAAA record) must be a public
//     address: private, loopback, link-local, ULA, unspecified, mapped and
//     multicast ranges are rejected BEFORE any connection is made.
//   - Redirects are never auto-followed: each hop's Location is re-validated
//     through the same policy, capped at MAX_REDIRECTS hops.
//   - One overall timeout covers all hops; response bodies are discarded
//     (capped by cancellation) — callers get {ok, status, finalUrl} only.
//
// v1 TOCTOU note: we validate the resolved addresses, then fetch the original
// URL by hostname. A DNS answer that changes between our lookup and the
// runtime's own resolution (DNS rebinding) could slip through in that small
// window. True IP-pinning needs a custom Agent/dispatcher; accepted as a v1
// trade-off and documented here deliberately.

export type LookupFn = (
  hostname: string,
) => Promise<{ address: string; family: number }[]>;

export interface SafeFetchOptions {
  method?: string;
  /** Overall deadline across all redirect hops. Default 10s. */
  timeoutMs?: number;
  /** Response size cap. Bodies are discarded regardless; kept for API shape. */
  maxBytes?: number;
  /** Only supported mode: follow redirects with per-hop re-validation. */
  redirect?: "follow-checked";
  maxRedirects?: number;
  /** DI seams for tests. */
  lookup?: LookupFn;
  fetchImpl?: typeof fetch;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
}

export class SafeFetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchBlockedError";
  }
}

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------
// Address policy
// ---------------------------------------------------------------------------

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // unparseable → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 ("this network", incl. 0.0.0.0)
  if (a === 10) return true; // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === "::" || norm === "::1") return true; // unspecified / loopback
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true; // fc00::/7 ULA
  if (/^fe[89ab]/.test(norm)) return true; // fe80::/10 link-local
  // IPv4-mapped (::ffff:a.b.c.d, dotted or hex form): validate the embedded v4.
  const mapped = norm.match(/^::ffff:(.+)$/);
  if (mapped) {
    const rest = mapped[1];
    if (rest.includes(".")) return ipv4IsPrivate(rest);
    const hextets = rest.split(":");
    if (hextets.length === 2) {
      const hi = parseInt(hextets[0], 16);
      const lo = parseInt(hextets[1], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        return ipv4IsPrivate(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
      }
    }
    return true; // unparseable mapped form → unsafe
  }
  return false;
}

/** True when the address must never be connected to. Exported for reuse. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipv4IsPrivate(address);
  if (family === 6) return ipv6IsPrivate(address);
  return true; // not an IP at all → unsafe as an *address*
}

async function assertUrlAllowed(url: URL, lookup: LookupFn): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchBlockedError(`Blocked URL scheme: ${url.protocol}`);
  }
  // WHATWG URL has already normalized shorthand IPv4 ("127.1" → "127.0.0.1")
  // and bracketed IPv6 hosts.
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new SafeFetchBlockedError(`Blocked private/reserved address: ${host}`);
    }
    return;
  }
  let records: { address: string; family: number }[];
  try {
    records = await lookup(host);
  } catch {
    throw new SafeFetchBlockedError(`DNS resolution failed for ${host}`);
  }
  if (records.length === 0) {
    throw new SafeFetchBlockedError(`DNS resolution returned no addresses for ${host}`);
  }
  for (const r of records) {
    if (isPrivateAddress(r.address)) {
      throw new SafeFetchBlockedError(
        `Blocked: ${host} resolves to private/reserved address ${r.address}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// safeFetch
// ---------------------------------------------------------------------------

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const defaultLookup: LookupFn = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const {
    method = "GET",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = MAX_REDIRECTS,
    lookup = defaultLookup,
    fetchImpl = fetch,
  } = options;
  // maxBytes is accepted for API shape; bodies are always discarded below.
  void (options.maxBytes ?? DEFAULT_MAX_BYTES);
  if (options.redirect !== undefined && options.redirect !== "follow-checked") {
    throw new SafeFetchBlockedError(`Unsupported redirect mode: ${options.redirect}`);
  }

  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new SafeFetchBlockedError(`Invalid URL: ${url}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; ; hop++) {
      await assertUrlAllowed(current, lookup);
      const res = await fetchImpl(current.toString(), {
        method,
        redirect: "manual",
        signal: controller.signal,
      });
      // We never return bodies; cancel to release the connection.
      try {
        await res.body?.cancel();
      } catch {
        /* already consumed/closed */
      }
      const location = res.headers.get("location");
      if (REDIRECT_STATUSES.has(res.status) && location) {
        if (hop >= maxRedirects) {
          throw new SafeFetchBlockedError(`Too many redirects (max ${maxRedirects})`);
        }
        try {
          current = new URL(location, current);
        } catch {
          throw new SafeFetchBlockedError(`Invalid redirect location: ${location}`);
        }
        continue; // next hop is re-validated at the top of the loop
      }
      return { ok: res.ok, status: res.status, finalUrl: current.toString() };
    }
  } finally {
    clearTimeout(timer);
  }
}
