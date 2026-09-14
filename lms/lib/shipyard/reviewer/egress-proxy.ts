// The render sandbox's network policy, enforced where the packets actually go.
//
// `page.route` is a BROWSER-LEVEL hook, not a network policy. Chromium does not
// call it for redirect hops, it does not call it for WebSocket handshakes, and
// the hostname it hands us was resolved by Chromium's own resolver — so a page
// that 302s to `http://169.254.169.254/`, or a host whose DNS answer flips
// between our check and Chromium's lookup, walks straight past it. The fix is
// not a better allow-list: it is to stop Chromium from talking to the network
// at all except through something we control.
//
// So the worker starts THIS: a loopback-only HTTP proxy, for the lifetime of
// one render, and Chromium is launched with `--proxy-server` pointed at it.
// Every byte the browser sends — the top-level navigation, every redirect hop,
// every subresource, every WebSocket upgrade, every fetch from page script —
// arrives here first, as either a plain absolute-form HTTP request or a
// `CONNECT` tunnel. For each one this module:
//
//   1. resolves the hostname ITSELF (dns.lookup, all addresses),
//   2. refuses when ANY answer fails `isPrivateAddress`, so a mixed
//      public/private answer set — the rebinding shape — fails closed,
//   3. refuses a port that is not 80, 443, or the port the student's own URL
//      named explicitly,
//   4. connects to the VETTED ADDRESS rather than to the hostname, so the name
//      is never resolved a second time.
//
// It is deliberately small, dependency-free (`node:http` + `node:net`) and
// listens on 127.0.0.1 with an ephemeral port, so nothing outside this process
// can reach it. It never proxies anything for anyone else: it exists for the
// length of one render and is closed in a `finally`.

import { lookup as dnsLookup } from "node:dns/promises";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect as netConnect, isIP, type Socket } from "node:net";
import { isPrivateAddress } from "@/lib/net/safe-fetch";

/** Ports a student's product may be served on, plus its own explicit port. */
export const PROXY_ALLOWED_PORTS: readonly number[] = [80, 443];

/** Upstream sockets are abandoned after this; a render's own deadline is shorter. */
const UPSTREAM_TIMEOUT_MS = 30_000;

export type ProxyLookupFn = (
  hostname: string,
) => Promise<{ address: string; family: number }[]>;

const defaultLookup: ProxyLookupFn = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

export type ProxyDecision =
  | { allowed: true; address: string; reason: string }
  | { allowed: false; reason: string };

export type ProxyRequestShape = {
  /** Hostname without IPv6 brackets. */
  host: string;
  port: number;
  /** `connect` is the CONNECT tunnel (https and wss); `plain` is absolute-form http. */
  kind: "plain" | "connect";
  /** Every address the hostname resolved to, in answer order. */
  addresses: readonly string[];
  /** The port the submitted URL named explicitly, when it named one. */
  extraPort?: number | null;
};

/**
 * The whole policy, as one pure function so it can be tested without a socket.
 *
 * Order matters: the port rule is cheap and refuses before any address is
 * looked at, and the address rule refuses on the FIRST private answer while
 * still naming it, because "which address" is the only useful half of the
 * refusal for whoever reads the note afterwards.
 */
export function decideProxyRequest(input: ProxyRequestShape): ProxyDecision {
  const host = input.host.trim().replace(/\.$/, "").toLowerCase();
  if (!host) return { allowed: false, reason: "the request named no host" };

  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65_535) {
    return { allowed: false, reason: `port ${input.port} is not a port` };
  }
  const extra =
    typeof input.extraPort === "number" && Number.isInteger(input.extraPort)
      ? input.extraPort
      : null;
  if (!PROXY_ALLOWED_PORTS.includes(input.port) && input.port !== extra) {
    return {
      allowed: false,
      reason: `port ${input.port} is not 80, 443${extra ? ` or ${extra}` : ""}`,
    };
  }

  if (input.addresses.length === 0) {
    return { allowed: false, reason: `${host} resolved to no addresses` };
  }
  for (const address of input.addresses) {
    if (isIP(address) === 0) {
      return { allowed: false, reason: `${host} resolved to an invalid address (${address})` };
    }
    if (isPrivateAddress(address)) {
      return {
        allowed: false,
        reason: `${host} resolves to a private or reserved address (${address})`,
      };
    }
  }

  return {
    allowed: true,
    address: input.addresses[0],
    reason: `${input.kind} ${host}:${input.port} pinned to ${input.addresses[0]}`,
  };
}

/** `example.com:443`, `[2606:4700::1]:443`, or a bare host (CONNECT authority). */
export function parseAuthority(raw: string, fallbackPort: number): { host: string; port: number } | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end < 0) return null;
    const host = value.slice(1, end);
    const rest = value.slice(end + 1);
    if (rest === "") return { host, port: fallbackPort };
    if (!rest.startsWith(":")) return null;
    const port = Number(rest.slice(1));
    return Number.isInteger(port) ? { host, port } : null;
  }
  const colon = value.lastIndexOf(":");
  if (colon < 0) return { host: value, port: fallbackPort };
  const port = Number(value.slice(colon + 1));
  if (!Number.isInteger(port)) return null;
  return { host: value.slice(0, colon), port };
}

export type EgressProxy = {
  /** The loopback port Chromium is pointed at. */
  port: number;
  /** How many requests the policy refused. */
  readonly blocked: number;
  /** One line per refusal, capped, for the render's notes. */
  readonly refusals: readonly string[];
  close(): Promise<void>;
};

export type EgressProxyOptions = {
  /** The port the submitted URL named explicitly, allowed alongside 80/443. */
  extraPort?: number | null;
  /** DNS seam, so a test can drive the policy without a resolver. */
  lookup?: ProxyLookupFn;
};

const REFUSAL_CAP = 25;

/**
 * Start the proxy. Resolves once it is listening on 127.0.0.1; the caller
 * interpolates `port` into Chromium's `--proxy-server` and closes it in a
 * `finally`.
 */
export async function startEgressProxy(options: EgressProxyOptions = {}): Promise<EgressProxy> {
  const lookup = options.lookup ?? defaultLookup;
  const extraPort = options.extraPort ?? null;

  let blocked = 0;
  const refusals: string[] = [];
  const refuse = (reason: string) => {
    blocked += 1;
    if (refusals.length < REFUSAL_CAP) refusals.push(reason);
  };

  const sockets = new Set<Socket>();
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
  };

  async function addressesFor(host: string): Promise<string[] | null> {
    if (isIP(host)) return [host];
    try {
      const answers = await lookup(host);
      return answers.map((a) => a.address);
    } catch {
      return null;
    }
  }

  async function vet(
    host: string,
    port: number,
    kind: "plain" | "connect",
  ): Promise<ProxyDecision> {
    const addresses = await addressesFor(host);
    if (addresses === null) return { allowed: false, reason: `${host} did not resolve` };
    return decideProxyRequest({ host, port, kind, addresses, extraPort });
  }

  const server: Server = createServer();

  // --- Plain http, absolute-form ------------------------------------------
  server.on("request", (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      let url: URL;
      try {
        url = new URL(req.url ?? "");
      } catch {
        refuse(`the browser asked for a non-absolute proxy target (${req.url ?? ""})`);
        res.writeHead(400).end();
        return;
      }
      if (url.protocol !== "http:") {
        refuse(`scheme ${url.protocol} is never proxied`);
        res.writeHead(403).end();
        return;
      }
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const port = url.port ? Number(url.port) : 80;
      const decision = await vet(host, port, "plain");
      if (!decision.allowed) {
        refuse(decision.reason);
        res.writeHead(403, { "content-type": "text/plain" }).end("blocked by the render sandbox");
        return;
      }

      const headers = { ...req.headers };
      delete headers["proxy-connection"];
      delete headers["proxy-authorization"];
      headers.host = url.host;

      const upstream = httpRequest(
        {
          host: decision.address,
          port,
          method: req.method,
          path: `${url.pathname}${url.search}`,
          headers,
          // The address is already vetted and pinned; node must not re-resolve.
          setHost: false,
          family: isIP(decision.address) === 6 ? 6 : 4,
        },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => upstream.destroy());
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      res.on("close", () => upstream.destroy());
      req.pipe(upstream);
    })();
  });

  // --- CONNECT tunnels: https, wss, and anything else the browser upgrades --
  server.on("connect", (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    track(clientSocket);
    void (async () => {
      const authority = parseAuthority(req.url ?? "", 443);
      if (!authority) {
        refuse(`the browser asked to tunnel to an unparseable authority (${req.url ?? ""})`);
        clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
      }
      const decision = await vet(authority.host, authority.port, "connect");
      if (!decision.allowed) {
        refuse(decision.reason);
        clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
        return;
      }

      const upstream = netConnect(
        { host: decision.address, port: authority.port, family: isIP(decision.address) === 6 ? 6 : 4 },
        () => {
          clientSocket.write("HTTP/1.1 200 Connection Established\r\nProxy-Agent: shipyard-render\r\n\r\n");
          if (head && head.length > 0) upstream.write(head);
          upstream.pipe(clientSocket);
          clientSocket.pipe(upstream);
        },
      );
      track(upstream);
      upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => upstream.destroy());
      upstream.on("error", () => {
        if (!clientSocket.destroyed) clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      });
      clientSocket.on("close", () => upstream.destroy());
    })();
  });

  server.on("connection", track);
  server.on("clientError", (_err, socket) => {
    if (socket && !socket.destroyed) socket.destroy();
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address) resolve(address.port);
      else reject(new Error("the egress proxy did not bind a port"));
    });
  });

  return {
    port,
    get blocked() {
      return blocked;
    },
    get refusals() {
      return refusals;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
