import { describe, expect, it } from "vitest";
import {
  SafeFetchBlockedError,
  isPrivateAddress,
  safeFetch,
  safeFetchBytes,
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
      "100.64.0.1", // CGNAT 100.64/10
      "100.127.255.255", // CGNAT upper edge
      "224.0.0.1", // multicast
      "239.255.255.250", // multicast (SSDP)
      "255.255.255.255", // broadcast / reserved
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
      "[::ffff:7f00:0001]", // hex-mapped 127.0.0.1 (two-hextet form)
      "[::ffff:0a00:0001]", // hex-mapped 10.0.0.1 (two-hextet form)
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

describe("isPrivateAddress — named ranges (#17)", () => {
  it("rejects CGNAT, multicast and reserved IPv4 ranges", () => {
    for (const ip of ["100.64.0.1", "100.127.255.255", "224.0.0.1", "239.255.255.250", "255.255.255.255"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    // Just OUTSIDE CGNAT stays public (proves the bound is not over-broad).
    expect(isPrivateAddress("100.63.255.255")).toBe(false);
    expect(isPrivateAddress("100.128.0.1")).toBe(false);
    // Just below multicast stays public.
    expect(isPrivateAddress("223.255.255.255")).toBe(false);
  });

  it("parses the two-hextet IPv6-mapped form and classifies by the embedded v4", () => {
    // Private embedded v4 → rejected.
    expect(isPrivateAddress("::ffff:7f00:0001")).toBe(true); // 127.0.0.1
    expect(isPrivateAddress("::ffff:0a00:0001")).toBe(true); // 10.0.0.1
    expect(isPrivateAddress("::ffff:a9fe:a9fe")).toBe(true); // 169.254.169.254
    // Public embedded v4 (129.64.10.1) → allowed: the hex branch is exercised
    // and correctly returns false, not a blanket reject.
    expect(isPrivateAddress("::ffff:8140:0a01")).toBe(false);
  });
});

describe("safeFetchBytes — byte-cap truncation (#16)", () => {
  // A fetchImpl that streams `bytes` in small chunks so the read loop runs.
  function streamingFetch(bytes: Uint8Array, chunkSize = 3): typeof fetch {
    return () => {
      let pos = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pos >= bytes.length) {
            controller.close();
            return;
          }
          const end = Math.min(pos + chunkSize, bytes.length);
          controller.enqueue(bytes.slice(pos, end));
          pos = end;
        },
      });
      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
      );
    };
  }

  it("truncates a body larger than maxBytes at exactly the cap", async () => {
    const body = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // 10 bytes
    const out = await safeFetchBytes("https://good.example.com/img", {
      lookup: publicLookup,
      fetchImpl: streamingFetch(body),
      maxBytes: 4,
    });
    expect(out.truncated).toBe(true);
    expect(out.body.length).toBe(4);
    expect([...out.body]).toEqual([0, 1, 2, 3]);
  });

  it("returns the full body untruncated when it is under the cap", async () => {
    const body = new Uint8Array([10, 20, 30]);
    const out = await safeFetchBytes("https://good.example.com/small", {
      lookup: publicLookup,
      fetchImpl: streamingFetch(body),
      maxBytes: 10,
    });
    expect(out.truncated).toBe(false);
    expect(out.body.length).toBe(3);
    expect([...out.body]).toEqual([10, 20, 30]);
  });

  it("a body exactly at the cap is not flagged truncated", async () => {
    const body = new Uint8Array([1, 2, 3, 4]);
    const out = await safeFetchBytes("https://good.example.com/exact", {
      lookup: publicLookup,
      fetchImpl: streamingFetch(body, 4),
      maxBytes: 4,
    });
    expect(out.truncated).toBe(false);
    expect(out.body.length).toBe(4);
    expect([...out.body]).toEqual([1, 2, 3, 4]);
  });
});
