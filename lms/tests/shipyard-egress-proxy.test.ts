// The render sandbox's real network policy (SEC-1).
//
// `page.route` never sees a redirect hop, a WebSocket handshake, or the
// address Chromium's own resolver picked. The egress proxy does, so these are
// the tests that matter: the decision function over every shape the browser
// can hand it, and one end-to-end pass over a live loopback proxy proving that
// a refused target never reaches a socket.

import { createServer, request as httpRequest, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decideProxyRequest,
  parseAuthority,
  PROXY_ALLOWED_PORTS,
  startEgressProxy,
} from "@/lib/shipyard/reviewer/egress-proxy";

const PUBLIC = "93.184.216.34";

const shape = (over: Partial<Parameters<typeof decideProxyRequest>[0]> = {}) => ({
  host: "dabbaroute.vercel.app",
  port: 443,
  kind: "connect" as const,
  addresses: [PUBLIC],
  ...over,
});

describe("decideProxyRequest — addresses", () => {
  it("allows a public address and pins to the first answer", () => {
    const decision = decideProxyRequest(shape({ addresses: [PUBLIC, "93.184.216.35"] }));
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.address).toBe(PUBLIC);
  });

  it("refuses every private and reserved range", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.7",
      "172.16.4.4",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.7",
    ]) {
      const decision = decideProxyRequest(shape({ addresses: [address] }));
      expect(decision.allowed, address).toBe(false);
      expect(decision.reason).toMatch(/private or reserved/);
    }
  });

  it("fails closed on a MIXED public and private answer set — the rebinding shape", () => {
    const decision = decideProxyRequest(shape({ addresses: [PUBLIC, "10.0.0.7"] }));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("10.0.0.7");
  });

  it("fails closed on no answers, junk answers and an empty host", () => {
    expect(decideProxyRequest(shape({ addresses: [] })).allowed).toBe(false);
    expect(decideProxyRequest(shape({ addresses: ["not-an-ip"] })).allowed).toBe(false);
    expect(decideProxyRequest(shape({ host: "   " })).allowed).toBe(false);
  });
});

describe("decideProxyRequest — ports", () => {
  it("allows 80 and 443 and nothing else by default", () => {
    for (const port of PROXY_ALLOWED_PORTS) {
      expect(decideProxyRequest(shape({ port })).allowed, String(port)).toBe(true);
    }
    for (const port of [22, 25, 5432, 6379, 8080, 9200, 11211]) {
      const decision = decideProxyRequest(shape({ port }));
      expect(decision.allowed, String(port)).toBe(false);
      expect(decision.reason).toMatch(/is not 80, 443/);
    }
  });

  it("allows the port the submitted URL named explicitly, and only that one", () => {
    expect(decideProxyRequest(shape({ port: 8443, extraPort: 8443 })).allowed).toBe(true);
    expect(decideProxyRequest(shape({ port: 5432, extraPort: 8443 })).allowed).toBe(false);
  });

  it("refuses a port that is not a port", () => {
    expect(decideProxyRequest(shape({ port: 0 })).allowed).toBe(false);
    expect(decideProxyRequest(shape({ port: 70_000 })).allowed).toBe(false);
    expect(decideProxyRequest(shape({ port: Number.NaN })).allowed).toBe(false);
  });
});

describe("decideProxyRequest — CONNECT and plain are judged the same way", () => {
  it("applies the address rule to both", () => {
    for (const kind of ["plain", "connect"] as const) {
      expect(decideProxyRequest(shape({ kind, port: 80, addresses: [PUBLIC] })).allowed).toBe(true);
      expect(
        decideProxyRequest(shape({ kind, port: 80, addresses: ["169.254.169.254"] })).allowed,
      ).toBe(false);
    }
  });

  it("refuses a CONNECT tunnel to a database port even on a public host", () => {
    expect(decideProxyRequest(shape({ kind: "connect", port: 5432 })).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The redirect chain, hop by hop
// ---------------------------------------------------------------------------
//
// Chromium follows a 302 itself and `page.route` is never called for the hop —
// but with the proxy in front of it, the hop is a NEW proxy request and is
// vetted like any other. This is that sequence, as the proxy sees it.

describe("a redirect chain, as the proxy sees it", () => {
  it("allows the first hop and refuses the metadata service the 302 pointed at", () => {
    const hops = [
      { host: "dabbaroute.vercel.app", port: 443, addresses: [PUBLIC] },
      { host: "169.254.169.254", port: 80, addresses: ["169.254.169.254"] },
    ];
    const decisions = hops.map((hop) =>
      decideProxyRequest({ ...hop, kind: "connect", addresses: hop.addresses }),
    );
    expect(decisions[0].allowed).toBe(true);
    expect(decisions[1].allowed).toBe(false);
  });

  it("refuses a *.railway.internal hop whatever its DNS says", () => {
    const decision = decideProxyRequest({
      host: "shipyard-worker.railway.internal",
      port: 80,
      kind: "plain",
      addresses: ["fd12::7"],
    });
    expect(decision.allowed).toBe(false);
  });
});

describe("parseAuthority", () => {
  it("reads host:port, a bare host, and a bracketed IPv6", () => {
    expect(parseAuthority("example.com:443", 443)).toEqual({ host: "example.com", port: 443 });
    expect(parseAuthority("example.com", 443)).toEqual({ host: "example.com", port: 443 });
    expect(parseAuthority("[2606:4700::1]:443", 443)).toEqual({
      host: "2606:4700::1",
      port: 443,
    });
    expect(parseAuthority("[2606:4700::1]", 443)).toEqual({ host: "2606:4700::1", port: 443 });
  });

  it("fails closed on junk", () => {
    expect(parseAuthority("", 443)).toBeNull();
    expect(parseAuthority("example.com:notaport", 443)).toBeNull();
    expect(parseAuthority("[2606:4700::1", 443)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A live proxy, refusing a live loopback server
// ---------------------------------------------------------------------------

describe("the running proxy", () => {
  let origin: Server;
  let originPort = 0;

  beforeAll(async () => {
    origin = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("SECRET");
    });
    await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
    const address = origin.address();
    originPort = typeof address === "object" && address ? address.port : 0;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => origin.close(() => resolve()));
  });

  const through = (
    proxyPort: number,
    target: string,
  ): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const url = new URL(target);
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: proxyPort,
          method: "GET",
          // Absolute-form: exactly what a browser sends to an HTTP proxy.
          path: target,
          headers: { host: url.host },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            body += chunk;
          });
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on("error", reject);
      req.end();
    });

  it("refuses a loopback target and never reaches the server behind it", async () => {
    // `extraPort` is the origin's own port, so the port rule cannot be what
    // refuses this: the ADDRESS rule has to, which is the rule under test.
    const proxy = await startEgressProxy({ extraPort: originPort });
    try {
      const res = await through(proxy.port, `http://127.0.0.1:${originPort}/secret`);
      expect(res.status).toBe(403);
      expect(res.body).not.toContain("SECRET");
      expect(proxy.blocked).toBe(1);
      expect(proxy.refusals.join(" ")).toMatch(/private or reserved/);
    } finally {
      await proxy.close();
    }
  });

  it("refuses a hostname whose DNS answer is private, even on port 80", async () => {
    const proxy = await startEgressProxy({
      lookup: async () => [{ address: "10.0.0.7", family: 4 }],
    });
    try {
      const res = await through(proxy.port, "http://rebind.example.com/admin");
      expect(res.status).toBe(403);
      expect(proxy.refusals.join(" ")).toContain("10.0.0.7");
    } finally {
      await proxy.close();
    }
  });

  it("refuses a non-80/443 port on an otherwise public host", async () => {
    const proxy = await startEgressProxy({
      lookup: async () => [{ address: PUBLIC, family: 4 }],
    });
    try {
      const res = await through(proxy.port, "http://dabbaroute.vercel.app:5432/");
      expect(res.status).toBe(403);
      expect(proxy.refusals.join(" ")).toMatch(/is not 80, 443/);
    } finally {
      await proxy.close();
    }
  });

});
