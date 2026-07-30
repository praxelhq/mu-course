import { describe, expect, it } from "vitest";
import { selectRelevantLinks, validatePublicUrl } from "@/lib/extraction/url-policy";

describe("public URL policy", () => {
  it("rejects internal and credential-bearing targets", async () => {
    await expect(validatePublicUrl("http://127.0.0.1/admin")).rejects.toThrow("Private network");
    await expect(validatePublicUrl("https://user:pass@example.com")).rejects.toThrow("Credential-bearing");
    await expect(validatePublicUrl("file:///etc/passwd")).rejects.toThrow("HTTP and HTTPS");
  });

  it("prefers relevant same-domain links", () => {
    const source = new URL("https://example.com");
    expect(selectRelevantLinks(source, ["https://example.com/legal", "https://other.test/pricing", "/pricing", "/features", "/blog/post"], 2)).toEqual(["https://example.com/pricing", "https://example.com/features"]);
  });
});
