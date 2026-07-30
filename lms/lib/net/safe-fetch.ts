import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

// THE outbound-fetch policy module (KTD19). Every fetch of a user-supplied
// URL — link checks, graders, portfolio crawlers and browser capture — goes
// through this module. No raw fetch of user input anywhere else.
//
// Security invariants:
//   - http(s), credential-free URLs and read-only methods only.
//   - Every DNS answer must be a globally routable address. Mixed public and
//     private answer sets fail closed.
//   - Production connections are made through a request-scoped Undici Agent.
//     Its socket lookup can return only the address validated for that hop;
//     the original URL is unchanged, preserving Host and TLS SNI while closing
//     the DNS-check-then-fetch rebinding window.
//   - Redirects are manual and every hop receives a fresh resolution and pin.
//   - No global dispatcher is installed and there is no production fallback to
//     global fetch if pinning cannot be constructed.

export type LookupFn = (
  hostname: string,
) => Promise<{ address: string; family: number }[]>;

export interface SafeFetchPinnedTarget {
  /** Original URL hostname (without IPv6 brackets), used for Host/SNI. */
  hostname: string;
  /** The already-validated address the socket must connect to. */
  address: string;
  family: 4 | 6;
  protocol: "http:" | "https:";
  port: number;
}

export type SafeFetchPinnedFetch = (
  url: string,
  init: RequestInit,
  target: Readonly<SafeFetchPinnedTarget>,
) => Promise<Response>;

export interface SafeFetchOptions {
  method?: string;
  /** Overall deadline across DNS, connection, redirects and body reads. */
  timeoutMs?: number;
  /** Response size cap used by the byte/resource helpers. */
  maxBytes?: number;
  /** Only supported mode: follow redirects with per-hop re-validation. */
  redirect?: "follow-checked";
  maxRedirects?: number;
  /** A deliberately small set of caller headers is accepted; see below. */
  headers?: Readonly<Record<string, string>>;
  /** DNS and request seams for deterministic tests only. */
  lookup?: LookupFn;
  fetchImpl?: typeof fetch;
  pinnedFetchImpl?: SafeFetchPinnedFetch;
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
const MAX_CONFIGURABLE_REDIRECTS = 10;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const MAX_CONFIGURABLE_BYTES = 32 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Address policy
// ---------------------------------------------------------------------------

function createBlockList(
  entries: ReadonlyArray<readonly [address: string, prefix: number]>,
  family: "ipv4" | "ipv6",
): BlockList {
  const list = new BlockList();
  for (const [address, prefix] of entries) list.addSubnet(address, prefix, family);
  return list;
}

const NON_PUBLIC_IPV4 = createBlockList(
  [
    ["0.0.0.0", 8], // this network / unspecified
    ["10.0.0.0", 8],
    ["100.64.0.0", 10], // carrier-grade NAT (also Alibaba metadata)
    ["127.0.0.0", 8],
    ["169.254.0.0", 16], // link-local and common cloud metadata
    ["172.16.0.0", 12],
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // documentation
    ["192.88.99.0", 24], // deprecated 6to4 relay anycast
    ["192.168.0.0", 16],
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // documentation
    ["203.0.113.0", 24], // documentation
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved / limited broadcast
  ],
  "ipv4",
);

const GLOBAL_IPV6 = createBlockList([["2000::", 3]], "ipv6");
const NON_PUBLIC_IPV6 = createBlockList(
  [
    ["2001::", 23], // IPv6 special-purpose block (Teredo/ORCHID/etc.)
    ["2001:db8::", 32], // documentation
    ["2002::", 16], // 6to4 can tunnel to an embedded private IPv4
    ["3ffe::", 16], // returned 6bone prefix
    ["3fff::", 20], // documentation
  ],
  "ipv6",
);

function ipv4IsNonPublic(ip: string): boolean {
  if (isIP(ip) !== 4) return true;
  // Azure's host virtual IP is reachable only from inside Azure despite being
  // syntactically public, so treat it like a metadata/link-local endpoint.
  if (ip === "168.63.129.16") return true;
  return NON_PUBLIC_IPV4.check(ip, "ipv4");
}

function parseIpv6Hextets(ip: string): number[] | null {
  let input = ip.toLowerCase();
  if (input.includes("%")) return null; // scoped addresses are never public URLs

  if (input.includes(".")) {
    const separator = input.lastIndexOf(":");
    if (separator < 0) return null;
    const dotted = input.slice(separator + 1);
    if (isIP(dotted) !== 4) return null;
    const bytes = dotted.split(".").map(Number);
    const high = (bytes[0] << 8) | bytes[1];
    const low = (bytes[2] << 8) | bytes[3];
    input = `${input.slice(0, separator)}:${high.toString(16)}:${low.toString(16)}`;
  }

  const halves = input.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const values = half.split(":");
    if (values.some((value) => !/^[0-9a-f]{1,4}$/.test(value))) return null;
    return values.map((value) => Number.parseInt(value, 16));
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const omitted = 8 - left.length - right.length;
  if (omitted < 1) return null;
  return [...left, ...Array<number>(omitted).fill(0), ...right];
}

function ipv6IsNonPublic(ip: string): boolean {
  if (isIP(ip) !== 6) return true;
  const hextets = parseIpv6Hextets(ip);
  if (!hextets) return true;

  // IPv4-mapped IPv6 is classified by the embedded IPv4 address. This closes
  // alternate-spelling bypasses without unnecessarily rejecting public maps.
  if (
    hextets.slice(0, 5).every((part) => part === 0) &&
    hextets[5] === 0xffff
  ) {
    return ipv4IsNonPublic(
      `${hextets[6] >> 8}.${hextets[6] & 0xff}.${hextets[7] >> 8}.${hextets[7] & 0xff}`,
    );
  }

  // Globally routable unicast currently lives in 2000::/3. The additional
  // denylist removes special/documentation/tunnel ranges inside that block.
  return (
    !GLOBAL_IPV6.check(ip, "ipv6") || NON_PUBLIC_IPV6.check(ip, "ipv6")
  );
}

/** True when an address must never be connected to. Exported for reuse. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipv4IsNonPublic(address);
  if (family === 6) return ipv6IsNonPublic(address);
  return true;
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Safe fetch aborted", "AbortError");
}

async function lookupWithAbort(
  hostname: string,
  lookup: LookupFn,
  signal: AbortSignal,
): Promise<{ address: string; family: number }[]> {
  if (signal.aborted) throw abortReason(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => lookup(hostname))
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function targetFor(url: URL, hostname: string, address: string): SafeFetchPinnedTarget {
  const family = isIP(address);
  if (family !== 4 && family !== 6) {
    throw new SafeFetchBlockedError(`DNS returned an invalid address for ${hostname}`);
  }
  return {
    hostname,
    address,
    family,
    protocol: url.protocol as "http:" | "https:",
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
  };
}

async function resolveAllowedTarget(
  url: URL,
  lookup: LookupFn,
  signal: AbortSignal,
): Promise<SafeFetchPinnedTarget> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchBlockedError(`Blocked URL scheme: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new SafeFetchBlockedError("Blocked URL credentials");
  }

  // WHATWG URL normalizes shorthand IPv4 (127.1 -> 127.0.0.1).
  const hostname = url.hostname.startsWith("[")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (isPrivateAddress(hostname)) {
      throw new SafeFetchBlockedError(`Blocked private/reserved address: ${hostname}`);
    }
    return targetFor(url, hostname, hostname);
  }

  let records: { address: string; family: number }[];
  try {
    records = await lookupWithAbort(hostname, lookup, signal);
  } catch {
    if (signal.aborted) throw abortReason(signal);
    throw new SafeFetchBlockedError(`DNS resolution failed for ${hostname}`);
  }
  if (records.length === 0) {
    throw new SafeFetchBlockedError(`DNS resolution returned no addresses for ${hostname}`);
  }

  for (const record of records) {
    const actualFamily = isIP(record.address);
    if (
      (actualFamily !== 4 && actualFamily !== 6) ||
      record.family !== actualFamily
    ) {
      throw new SafeFetchBlockedError(`DNS returned an invalid address for ${hostname}`);
    }
    if (isPrivateAddress(record.address)) {
      throw new SafeFetchBlockedError(
        `Blocked: ${hostname} resolves to private/reserved address ${record.address}`,
      );
    }
  }

  // Pin one validated address. Retrying another address would require a new
  // explicit request/validation cycle; the connector can never re-resolve.
  return targetFor(url, hostname, records[0].address);
}

// ---------------------------------------------------------------------------
// Per-request pinned transport
// ---------------------------------------------------------------------------

function normalizedHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function pinnedLookup(target: Readonly<SafeFetchPinnedTarget>): LookupFunction {
  return (hostname, options, callback) => {
    const fail = (message: string) => {
      const error = Object.assign(new Error(message), { code: "ENOTFOUND" });
      queueMicrotask(() => callback(error, "", 0));
    };
    if (normalizedHostname(hostname) !== normalizedHostname(target.hostname)) {
      fail("Pinned dispatcher refused an unexpected hostname");
      return;
    }
    const requestedFamily =
      options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
    if (requestedFamily && requestedFamily !== target.family) {
      fail("Pinned dispatcher refused a different address family");
      return;
    }
    queueMicrotask(() => {
      if (options.all) {
        callback(null, [{ address: target.address, family: target.family }]);
      } else {
        callback(null, target.address, target.family);
      }
    });
  };
}

interface ResponseLease {
  res: Response;
  release(): Promise<void>;
}

async function productionPinnedFetch(
  url: string,
  init: RequestInit,
  target: Readonly<SafeFetchPinnedTarget>,
  timeoutMs: number,
): Promise<ResponseLease> {
  let dispatcher: Agent;
  try {
    dispatcher = new Agent({
      connections: 1,
      pipelining: 0,
      connectTimeout: timeoutMs,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connect: {
        family: target.family,
        lookup: pinnedLookup(target),
        // buildConnector otherwise derives this from the untouched URL host;
        // making it explicit documents and guarantees the TLS identity.
        servername:
          target.protocol === "https:" && isIP(target.hostname) === 0
            ? target.hostname
            : undefined,
      },
    });
  } catch {
    throw new SafeFetchBlockedError("Unable to construct a pinned connection");
  }

  try {
    const response = await undiciFetch(url, {
      method: init.method,
      headers: init.headers as Record<string, string>,
      redirect: init.redirect,
      signal: init.signal,
      dispatcher,
    });
    return {
      res: response as unknown as Response,
      release: async () => {
        try {
          await dispatcher.close();
        } catch {
          await dispatcher.destroy().catch(() => {});
        }
      },
    };
  } catch (error) {
    await dispatcher.destroy(error instanceof Error ? error : null).catch(() => {});
    throw error;
  }
}

const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "cache-control",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-unmodified-since",
  "pragma",
  "range",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "upgrade-insecure-requests",
  "user-agent",
]);

function safeRequestHeaders(input?: Readonly<Record<string, string>>): Record<string, string> {
  const output: Record<string, string> = { "accept-encoding": "identity" };
  for (const [rawName, value] of Object.entries(input ?? {})) {
    const name = rawName.trim().toLowerCase();
    if (!SAFE_REQUEST_HEADERS.has(name)) {
      throw new SafeFetchBlockedError(`Blocked outbound request header: ${rawName}`);
    }
    if (/[\r\n]/.test(value)) {
      throw new SafeFetchBlockedError(`Blocked invalid request header: ${rawName}`);
    }
    output[name] = value;
  }
  return output;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const defaultLookup: LookupFn = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

async function cancelBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // The body may already be consumed or the peer may have closed first.
  }
}

function positiveInteger(name: string, value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new SafeFetchBlockedError(`Invalid ${name}`);
  }
  return value;
}

function redirectCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CONFIGURABLE_REDIRECTS) {
    throw new SafeFetchBlockedError("Invalid maxRedirects");
  }
  return value;
}

/**
 * Validate every hop and return the final response with a live request-scoped
 * dispatcher. The caller must consume/cancel the body and release the lease.
 */
async function policyLoop(
  url: string,
  options: SafeFetchOptions,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{ lease: ResponseLease; finalUrl: string }> {
  const method = (options.method ?? "GET").toUpperCase();
  const maxRedirects = redirectCount(options.maxRedirects ?? MAX_REDIRECTS);
  const lookup = options.lookup ?? defaultLookup;
  if (method !== "GET" && method !== "HEAD") {
    throw new SafeFetchBlockedError(`Blocked outbound method: ${method}`);
  }
  if (options.redirect !== undefined && options.redirect !== "follow-checked") {
    throw new SafeFetchBlockedError(`Unsupported redirect mode: ${options.redirect}`);
  }
  if (options.fetchImpl && options.pinnedFetchImpl) {
    throw new SafeFetchBlockedError("Conflicting safe-fetch test transports");
  }
  const headers = safeRequestHeaders(options.headers);

  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new SafeFetchBlockedError(`Invalid URL: ${url}`);
  }

  for (let hop = 0; ; hop++) {
    const target = await resolveAllowedTarget(current, lookup, signal);
    if (signal.aborted) throw abortReason(signal);
    const init: RequestInit = { method, headers, redirect: "manual", signal };
    let lease: ResponseLease;
    if (options.pinnedFetchImpl) {
      lease = {
        res: await options.pinnedFetchImpl(current.toString(), init, target),
        release: async () => {},
      };
    } else if (options.fetchImpl) {
      // Backward-compatible deterministic test seam. Production callers do
      // not supply this; without it the only transport is the pinned Agent.
      lease = {
        res: await options.fetchImpl(current.toString(), init),
        release: async () => {},
      };
    } else {
      lease = await productionPinnedFetch(current.toString(), init, target, timeoutMs);
    }

    const location = lease.res.headers.get("location");
    if (REDIRECT_STATUSES.has(lease.res.status) && location) {
      await cancelBody(lease.res);
      await lease.release();
      if (hop >= maxRedirects) {
        throw new SafeFetchBlockedError(`Too many redirects (max ${maxRedirects})`);
      }
      try {
        current = new URL(location, current);
      } catch {
        throw new SafeFetchBlockedError(`Invalid redirect location: ${location}`);
      }
      continue;
    }
    return { lease, finalUrl: current.toString() };
  }
}

function timeoutController(timeoutMs: number): {
  controller: AbortController;
  clear(): void;
} {
  positiveInteger("timeoutMs", timeoutMs, 60_000);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Safe fetch timed out", "AbortError")),
    timeoutMs,
  );
  return { controller, clear: () => clearTimeout(timer) };
}

export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = timeoutController(timeoutMs);
  try {
    const { lease, finalUrl } = await policyLoop(
      url,
      options,
      deadline.controller.signal,
      timeoutMs,
    );
    try {
      await cancelBody(lease.res);
      return { ok: lease.res.ok, status: lease.res.status, finalUrl };
    } finally {
      await lease.release();
    }
  } finally {
    deadline.clear();
  }
}

/** HEAD-first liveness probe with a caller-supplied GET retry predicate. */
export async function probeUrl(
  url: string,
  options: SafeFetchOptions,
  shouldRetryWithGet: (res: SafeFetchResult) => boolean,
): Promise<SafeFetchResult> {
  let res = await safeFetch(url, { ...options, method: "HEAD" });
  if (shouldRetryWithGet(res)) {
    res = await safeFetch(url, { ...options, method: "GET" });
  }
  return res;
}

export interface SafeFetchBytesResult extends SafeFetchResult {
  contentType: string | null;
  body: Uint8Array;
  truncated: boolean;
}

async function readBodyCapped(
  res: Response,
  maxBytes: number,
): Promise<{ body: Uint8Array; truncated: boolean }> {
  if (!res.body) return { body: new Uint8Array(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let stored = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const take = Math.min(value.byteLength, maxBytes - stored);
      if (take > 0) {
        chunks.push(value.subarray(0, take));
        stored += take;
      }
      if (take < value.byteLength) {
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      // If stored === maxBytes, read once more: EOF means the body was exactly
      // at the cap; another byte means it is genuinely truncated.
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }

  const body = new Uint8Array(stored);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, truncated };
}

/**
 * Compatibility byte helper. Successful bodies are capped and report whether
 * bytes were omitted; non-2xx responses retain the historical empty-body
 * behavior. Use safeFetchResource for route.fulfill and other all-or-nothing
 * proxying.
 */
export async function safeFetchBytes(
  url: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchBytesResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = positiveInteger(
    "maxBytes",
    options.maxBytes ?? DEFAULT_MAX_BYTES,
    MAX_CONFIGURABLE_BYTES,
  );
  const deadline = timeoutController(timeoutMs);
  try {
    const { lease, finalUrl } = await policyLoop(
      url,
      options,
      deadline.controller.signal,
      timeoutMs,
    );
    try {
      const base = {
        ok: lease.res.ok,
        status: lease.res.status,
        finalUrl,
        contentType: lease.res.headers.get("content-type"),
      };
      if (!lease.res.ok || !lease.res.body) {
        await cancelBody(lease.res);
        return { ...base, body: new Uint8Array(0), truncated: false };
      }
      return { ...base, ...(await readBodyCapped(lease.res, maxBytes)) };
    } finally {
      await lease.release();
    }
  } finally {
    deadline.clear();
  }
}

const DEFAULT_RESOURCE_CONTENT_TYPES = [
  "text/*",
  "image/*",
  "font/*",
  "audio/*",
  "video/*",
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/manifest+json",
  "application/octet-stream",
  "application/pdf",
  "application/wasm",
  "application/xhtml+xml",
  "application/xml",
] as const;

const SAFE_RESPONSE_HEADERS = new Set([
  "accept-ranges",
  "access-control-allow-origin",
  "access-control-expose-headers",
  "cache-control",
  "content-language",
  "content-type",
  "cross-origin-resource-policy",
  "etag",
  "expires",
  "last-modified",
  "vary",
]);

function safeResponseHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = { "x-content-type-options": "nosniff" };
  headers.forEach((value, name) => {
    const normalized = name.toLowerCase();
    if (SAFE_RESPONSE_HEADERS.has(normalized)) output[normalized] = value;
  });
  return output;
}

function contentTypeAllowed(
  contentType: string | null,
  allowedContentTypes: readonly string[],
): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  return allowedContentTypes.some((rawPattern) => {
    const pattern = rawPattern.trim().toLowerCase();
    if (pattern === "*/*" || !pattern.includes("/")) return false;
    if (pattern.endsWith("/*")) return mediaType.startsWith(pattern.slice(0, -1));
    return mediaType === pattern;
  });
}

export interface SafeFetchResourceOptions extends SafeFetchOptions {
  /** Defaults to common browser-renderable types; an all-types wildcard is rejected. */
  allowedContentTypes?: readonly string[];
}

export interface SafeFetchResourceResult extends SafeFetchResult {
  /** Safe route.fulfill subset; never contains cookies, redirects or framing policy. */
  headers: Record<string, string>;
  contentType: string | null;
  body: Uint8Array;
}

/**
 * All-or-nothing browser resource fetch. The response is connection-pinned,
 * type-checked and fully contained by maxBytes. Partial bodies are never
 * returned, making the result safe to pass to Playwright route.fulfill.
 */
export async function safeFetchResource(
  url: string,
  options: SafeFetchResourceOptions = {},
): Promise<SafeFetchResourceResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = positiveInteger(
    "maxBytes",
    options.maxBytes ?? DEFAULT_MAX_BYTES,
    MAX_CONFIGURABLE_BYTES,
  );
  const allowedContentTypes =
    options.allowedContentTypes ?? DEFAULT_RESOURCE_CONTENT_TYPES;
  if (allowedContentTypes.length === 0) {
    throw new SafeFetchBlockedError("No allowed resource content types");
  }
  const deadline = timeoutController(timeoutMs);
  try {
    const { lease, finalUrl } = await policyLoop(
      url,
      options,
      deadline.controller.signal,
      timeoutMs,
    );
    try {
      const contentType = lease.res.headers.get("content-type");
      if (!contentTypeAllowed(contentType, allowedContentTypes)) {
        await cancelBody(lease.res);
        throw new SafeFetchBlockedError(
          `Blocked resource content type: ${contentType ?? "missing"}`,
        );
      }
      const { body, truncated } = await readBodyCapped(lease.res, maxBytes);
      if (truncated) {
        throw new SafeFetchBlockedError(`Response exceeds ${maxBytes} bytes`);
      }
      return {
        ok: lease.res.ok,
        status: lease.res.status,
        finalUrl,
        headers: safeResponseHeaders(lease.res.headers),
        contentType,
        body,
      };
    } finally {
      await lease.release();
    }
  } finally {
    deadline.clear();
  }
}
