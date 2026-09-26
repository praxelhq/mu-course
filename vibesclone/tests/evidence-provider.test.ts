import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/extraction/url-policy", () => ({
  validatePublicUrl: vi.fn(async (raw: string, allowedHostname?: string) => {
    const url = new URL(raw);
    if (allowedHostname && url.hostname !== allowedHostname && !url.hostname.endsWith(`.${allowedHostname}`)) {
      throw new Error("Evidence escaped the submitted product domain.");
    }
    return url;
  }),
  selectRelevantLinks: vi.fn(() => []),
}));

import { extractProductEvidence } from "@/lib/extraction/firecrawl";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("evidence providers", () => {
  it("uses Exa contents when Firecrawl is not configured", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("EXA_API_KEY", "exa-test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ url: "https://linear.app/features", title: "Features", text: "Issue tracking workflow" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractProductEvidence("https://linear.app")).resolves.toEqual([
      { url: "https://linear.app/features", title: "Features", markdown: "Issue tracking workflow" },
    ]);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ urls: ["https://linear.app/"], subpages: 5 });
    expect(request.headers).toMatchObject({ "x-api-key": "exa-test" });
  });

  it("falls back to Exa when Firecrawl returns an error", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "firecrawl-test");
    vi.stubEnv("EXA_API_KEY", "exa-test");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ url: "https://linear.app", text: "Linear product evidence" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const pages = await extractProductEvidence("https://linear.app");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pages[0]?.markdown).toBe("Linear product evidence");
  });

  it("rejects provider results outside the submitted product domain", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("EXA_API_KEY", "exa-test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ url: "https://attacker.example/evidence", text: "Injected evidence" }],
    }), { status: 200 })));

    await expect(extractProductEvidence("https://linear.app")).rejects.toThrow("escaped the submitted product domain");
  });
});
