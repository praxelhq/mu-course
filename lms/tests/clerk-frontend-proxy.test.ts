import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyClerkFrontend } from "@/lib/auth/clerk";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function configure() {
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_proxy_fixture");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", `pk_live_${Buffer.from("clerk.lms.praxel.in$").toString("base64")}`);
  vi.stubEnv("APP_URL", "https://lms.praxel.in");
}

describe("Clerk frontend transport", () => {
  it("does not expose an unconfigured login proxy", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await proxyClerkFrontend(new Request("https://lms.praxel.in/api/clerk/v1/environment"))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards login POSTs only to Clerk, preserving body and trusted ingress IP", async () => {
    configure();
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(await new Response(init.body).text()).toBe("identifier=student%40example.edu");
      return new Response("{}", { headers: { "content-type": "application/json", "set-cookie": "__client=test; HttpOnly; Secure; Path=/" } });
    });
    vi.stubGlobal("fetch", fetch);
    const result = await proxyClerkFrontend(new Request("https://lms.praxel.in/api/clerk/v1/client/sign_ins?test=1", {
      method: "POST", body: "identifier=student%40example.edu",
      headers: { "x-real-ip": "203.0.113.10", "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "1.2.3.4", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "http" },
    }));
    expect(fetch.mock.calls[0][0]).toBe("https://frontend-api.clerk.dev/v1/client/sign_ins?test=1");
    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.10");
    expect(headers.has("cf-connecting-ip")).toBe(false);
    expect(headers.get("clerk-proxy-url")).toBe("https://lms.praxel.in/api/clerk");
    expect(headers.get("clerk-secret-key")).toBe("sk_test_proxy_fixture");
    expect(result.headers.get("set-cookie")).toContain("HttpOnly");
    expect(result.headers.has("clerk-secret-key")).toBe(false);
  });

  it.each([
    ["172.64.0.1", "203.0.113.25", "203.0.113.25"],
    ["2606:4700::1", "2001:db8::25", "2001:db8::25"],
    ["::ffff:172.64.0.1", "203.0.113.25", "203.0.113.25"],
    ["203.0.113.1", "198.51.100.2", "203.0.113.1"],
    ["104.32.0.1", "198.51.100.2", "104.32.0.1"],
    ["172.64.0.1", "1.2.3.4, 5.6.7.8", "172.64.0.1"],
    ["172.64.0.1", "", "172.64.0.1"],
    ["not-an-ip", "198.51.100.2", null],
    ["", "198.51.100.2", null],
  ])("forwards the visitor IP only through a trusted Cloudflare peer (%s, %s)", async (peer, visitor, expected) => {
    configure();
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await proxyClerkFrontend(new Request("https://lms.praxel.in/api/clerk/v1/environment", {
      headers: { "x-real-ip": peer, "cf-connecting-ip": visitor, "x-forwarded-for": "192.0.2.99" },
    }));
    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.get("x-forwarded-for")).toBe(expected);
    expect(headers.has("cf-connecting-ip")).toBe(false);
  });

  it("rewrites Clerk asset redirects back through the LMS", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {
      status: 307, headers: { location: "https://frontend-api.clerk.dev/npm/clerk.js" },
    })));
    const result = await proxyClerkFrontend(new Request("https://lms.praxel.in/api/clerk/npm/clerk.js"));
    expect(result.headers.get("location")).toBe("https://lms.praxel.in/api/clerk/npm/clerk.js");
  });

  it("rejects lookalike prefixes without forwarding requests", async () => {
    configure();
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await proxyClerkFrontend(new Request("https://lms.praxel.in/api/clerk-other/v1/client"))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
