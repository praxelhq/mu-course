import { describe, expect, it } from "vitest";
import {
  SafeFetchBlockedError,
  isPrivateAddress,
  safeFetch,
  safeFetchBytes,
  safeFetchResource,
  type LookupFn,
  type SafeFetchPinnedFetch,
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

  it("times out a DNS lookup before any connection is attempted", async () => {
    const hangingLookup: LookupFn = () => new Promise(() => {});
    let connected = false;
    const pinnedFetchImpl: SafeFetchPinnedFetch = () => {
      connected = true;
      return Promise.resolve(new Response("unexpected"));
    };
    await expect(
      safeFetch("https://slow-dns.example.com/", {
        lookup: hangingLookup,
        pinnedFetchImpl,
        timeoutMs: 25,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(connected).toBe(false);
  });

  it("pins the validated answer and never performs a connection-time re-resolution", async () => {
    let lookupCalls = 0;
    const rebindingLookup: LookupFn = () => {
      lookupCalls += 1;
      return Promise.resolve([
        lookupCalls === 1
          ? { address: "93.184.216.34", family: 4 }
          : { address: "169.254.169.254", family: 4 },
      ]);
    };
    const targets: Array<{ url: string; hostname: string; address: string }> = [];
    const pinnedFetchImpl: SafeFetchPinnedFetch = (url, _init, target) => {
      targets.push({ url, hostname: target.hostname, address: target.address });
      return Promise.resolve(new Response("ok", { status: 200 }));
    };

    const result = await safeFetch("https://good.example.com/original", {
      lookup: rebindingLookup,
      pinnedFetchImpl,
    });

    expect(result.status).toBe(200);
    expect(lookupCalls).toBe(1);
    expect(targets).toEqual([
      {
        url: "https://good.example.com/original",
        hostname: "good.example.com",
        address: "93.184.216.34",
      },
    ]);
  });

  it("creates a separately validated pin for every public redirect hop", async () => {
    const lookups: string[] = [];
    const lookup: LookupFn = (hostname) => {
      lookups.push(hostname);
      return Promise.resolve([
        {
          address: hostname === "first.example.com" ? "93.184.216.34" : "1.1.1.1",
          family: 4,
        },
      ]);
    };
    const pins: string[] = [];
    const pinnedFetchImpl: SafeFetchPinnedFetch = (url, _init, target) => {
      pins.push(`${target.hostname}=${target.address}`);
      if (url === "https://first.example.com/") {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://second.example.com/final" },
          }),
        );
      }
      return Promise.resolve(new Response("done", { status: 200 }));
    };

    const result = await safeFetch("https://first.example.com/", {
      lookup,
      pinnedFetchImpl,
    });

    expect(result.finalUrl).toBe("https://second.example.com/final");
    expect(lookups).toEqual(["first.example.com", "second.example.com"]);
    expect(pins).toEqual([
      "first.example.com=93.184.216.34",
      "second.example.com=1.1.1.1",
    ]);
  });

  it("blocks credentials, write methods and credential-bearing request headers", async () => {
    await expect(
      safeFetch("https://user:secret@good.example.com/", {
        lookup: publicLookup,
        fetchImpl: okFetch,
      }),
    ).rejects.toThrow(SafeFetchBlockedError);
    await expect(
      safeFetch("https://good.example.com/", {
        method: "POST",
        lookup: publicLookup,
        fetchImpl: okFetch,
      }),
    ).rejects.toThrow(SafeFetchBlockedError);
    await expect(
      safeFetch("https://good.example.com/", {
        headers: { authorization: "Bearer secret" },
        lookup: publicLookup,
        fetchImpl: okFetch,
      }),
    ).rejects.toThrow(SafeFetchBlockedError);
    await expect(
      safeFetch("https://good.example.com/", {
        headers: { cookie: "session=secret" },
        lookup: publicLookup,
        fetchImpl: okFetch,
      }),
    ).rejects.toThrow(SafeFetchBlockedError);
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

  it("rejects IPv6 multicast, documentation, tunnel and non-global ranges", () => {
    for (const ip of [
      "ff02::1",
      "2001:db8::1",
      "2002:0a00:1::",
      "3ffe::1",
      "3fff::1",
      "64:ff9b::a9fe:a9fe",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("rejects documentation and platform-only IPv4 addresses", () => {
    for (const ip of [
      "192.0.2.1",
      "198.51.100.2",
      "203.0.113.3",
      "198.18.0.1",
      "168.63.129.16",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
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

  it("detects an extra chunk after a first chunk exactly fills the cap", async () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const out = await safeFetchBytes("https://good.example.com/extra", {
      lookup: publicLookup,
      fetchImpl: streamingFetch(body, 4),
      maxBytes: 4,
    });
    expect(out.truncated).toBe(true);
    expect([...out.body]).toEqual([1, 2, 3, 4]);
  });
});

describe("safeFetchResource — route.fulfill contract", () => {
  it("returns complete bytes and only a safe response-header subset", async () => {
    const fetchImpl: typeof fetch = (_input, init) => {
      expect(init?.headers).toMatchObject({
        accept: "text/html",
        "accept-encoding": "identity",
      });
      return Promise.resolve(
        new Response("<h1>ok</h1>", {
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=60",
            connection: "close",
            "content-encoding": "gzip",
            "content-length": "11",
            "content-security-policy": "default-src 'none'",
            "content-type": "text/html; charset=utf-8",
            location: "https://internal.invalid/",
            "set-cookie": "session=secret",
          },
        }),
      );
    };

    const out = await safeFetchResource("https://good.example.com/page", {
      lookup: publicLookup,
      fetchImpl,
      headers: { accept: "text/html" },
      maxBytes: 1024,
      allowedContentTypes: ["text/html"],
    });

    expect(new TextDecoder().decode(out.body)).toBe("<h1>ok</h1>");
    expect(out.contentType).toBe("text/html; charset=utf-8");
    expect(out.headers).toEqual({
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    });
  });

  it("fails closed on a disallowed or missing content type", async () => {
    const executableFetch: typeof fetch = () =>
      Promise.resolve(
        new Response("MZ", {
          status: 200,
          headers: { "content-type": "application/x-msdownload" },
        }),
      );
    await expect(
      safeFetchResource("https://good.example.com/file", {
        lookup: publicLookup,
        fetchImpl: executableFetch,
        allowedContentTypes: ["text/*", "image/*"],
      }),
    ).rejects.toThrow(SafeFetchBlockedError);

    const missingTypeFetch: typeof fetch = () =>
      Promise.resolve(new Response(new TextEncoder().encode("unknown"), { status: 200 }));
    await expect(
      safeFetchResource("https://good.example.com/file", {
        lookup: publicLookup,
        fetchImpl: missingTypeFetch,
      }),
    ).rejects.toThrow(SafeFetchBlockedError);
  });

  it("throws instead of handing route.fulfill a partial oversized body", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4]);
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(bytes, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    await expect(
      safeFetchResource("https://good.example.com/large.png", {
        lookup: publicLookup,
        fetchImpl,
        maxBytes: 4,
        allowedContentTypes: ["image/*"],
      }),
    ).rejects.toThrow("Response exceeds 4 bytes");
  });
});
