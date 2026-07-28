import { describe, expect, it } from "vitest";
import {
  SafeFetchBlockedError,
  safeFetch,
  type LookupFn,
} from "../lib/net/safe-fetch";

// U8 — safe-fetch policy unit tests (KTD19). All network access is DI'd:
// `lookup` replaces DNS resolution, `fetchImpl` replaces the outbound fetch.

const publicLookup: LookupFn = () =>
  Promise.resolve([{ address: "93.184.216.34", family: 4 }]);

const okFetch: typeof fetch = () =>
  Promise.resolve(new Response("ok", { status: 200 }));

describe("safeFetch policy", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(safeFetch("ftp://example.com/x")).rejects.toThrow(SafeFetchBlockedError);
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(SafeFetchBlockedError);
    await expect(safeFetch("gopher://example.com")).rejects.toThrow(SafeFetchBlockedError);
  });

  it("rejects literal private / link-local / loopback / unspecified IPv4 hosts", async () => {
    for (const host of [
      "169.254.169.254", // cloud metadata
      "10.0.0.8",
      "10.255.255.1",
      "172.16.0.1",
      "172.31.99.99",
      "192.168.1.1",
      "127.0.0.1",
      "127.1", // WHATWG URL normalizes shorthand to 127.0.0.1
      "0.0.0.0",
    ]) {
      await expect(
        safeFetch(`http://${host}/`, { fetchImpl: okFetch }),
      ).rejects.toThrow(SafeFetchBlockedError);
    }
  });

  it("rejects literal IPv6 loopback / ULA / link-local / mapped hosts", async () => {
    for (const host of [
      "[::1]",
      "[fc00::1]",
      "[fd12:3456::1]",
      "[fe80::1]",
      "[::ffff:169.254.169.254]",
      "[::ffff:10.0.0.1]",
      "[::]",
    ]) {
      await expect(
        safeFetch(`http://${host}/`, { fetchImpl: okFetch }),
      ).rejects.toThrow(SafeFetchBlockedError);
    }
  });

  it("rejects hostnames that resolve to private IPs (any address)", async () => {
    const evilLookup: LookupFn = () =>
      Promise.resolve([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 }, // one private A record poisons the set
      ]);
    await expect(
      safeFetch("http://evil.example.com/", { lookup: evilLookup, fetchImpl: okFetch }),
    ).rejects.toThrow(SafeFetchBlockedError);

    const v6Lookup: LookupFn = () => Promise.resolve([{ address: "fd00::1", family: 6 }]);
    await expect(
      safeFetch("http://evil6.example.com/", { lookup: v6Lookup, fetchImpl: okFetch }),
    ).rejects.toThrow(SafeFetchBlockedError);
  });

  it("allows a public host and returns {ok, status, finalUrl}", async () => {
    const out = await safeFetch("https://good.example.com/page", {
      lookup: publicLookup,
      fetchImpl: okFetch,
      method: "HEAD",
      timeoutMs: 5000,
      maxBytes: 1024,
      redirect: "follow-checked",
    });
    expect(out.ok).toBe(true);
    expect(out.status).toBe(200);
    expect(out.finalUrl).toBe("https://good.example.com/page");
  });

  it("re-validates every redirect hop: a redirect to a private IP is blocked", async () => {
    const redirectingFetch: typeof fetch = (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://good.example.com")) {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data/" },
          }),
        );
      }
      return Promise.resolve(new Response("ok", { status: 200 }));
    };
    await expect(
      safeFetch("https://good.example.com/", {
        lookup: publicLookup,
        fetchImpl: redirectingFetch,
      }),
    ).rejects.toThrow(SafeFetchBlockedError);
  });

  it("follows a checked redirect to another public host", async () => {
    const redirectingFetch: typeof fetch = (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === "https://good.example.com/") {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://also-good.example.com/final" },
          }),
        );
      }
      return Promise.resolve(new Response("ok", { status: 200 }));
    };
    const out = await safeFetch("https://good.example.com/", {
      lookup: publicLookup,
      fetchImpl: redirectingFetch,
    });
    expect(out.ok).toBe(true);
    expect(out.status).toBe(200);
    expect(out.finalUrl).toBe("https://also-good.example.com/final");
  });

  it("enforces the redirect cap (3 hops)", async () => {
    let hops = 0;
    const loopFetch: typeof fetch = () => {
      hops += 1;
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: `https://good.example.com/hop${hops}` },
        }),
      );
    };
    await expect(
      safeFetch("https://good.example.com/", { lookup: publicLookup, fetchImpl: loopFetch }),
    ).rejects.toThrow(SafeFetchBlockedError);
    expect(hops).toBeLessThanOrEqual(4); // initial request + at most 3 followed hops
  });

  it("times out via timeoutMs (abort signal reaches the fetch)", async () => {
    const hangingFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    await expect(
      safeFetch("https://good.example.com/", {
        lookup: publicLookup,
        fetchImpl: hangingFetch,
        timeoutMs: 50,
      }),
    ).rejects.toThrow();
  });
});
