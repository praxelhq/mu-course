import { describe, expect, it } from "vitest";
import { publicProjectView } from "@/lib/public-projects";

describe("public project redaction", () => {
  it("returns only the safe report shape", () => {
    const view = publicProjectView({
      publicId: "public123", name: "Legal Flow", sourceUrl: "https://notion.so", niche: "Independent legal teams", usp: "Matter-first workflows", publishedAt: new Date("2026-08-13T00:00:00Z"),
      understanding: { productName: "Legal Flow", summary: "A focused legal workspace.", icp: ["Solo lawyers"], coreJobs: ["Track a matter"], productFlows: [{ name: "Matter intake", steps: ["Open", "Assign"] }], features: [{ name: "Matter board", disposition: "modify" as const, rationale: "Fits legal work", confidence: "high" as const, evidenceUrls: ["https://private.example/evidence"] }], nicheAndUspChanges: ["Replace docs with matters"], businessModelSignals: ["private-business-signal"], evidenceGaps: ["private-evidence-gap"] },
    });
    expect(view).toMatchObject({ publicId: "public123", niche: "Independent legal teams", productName: "Legal Flow" });
    expect(Object.keys(view).sort()).toEqual(["coreJobs", "features", "icp", "name", "niche", "nicheAndUspChanges", "productFlows", "productName", "publicId", "publishedAt", "sourceUrl", "summary", "usp"].sort());
    expect(Object.keys(view.features[0]).sort()).toEqual(["disposition", "name", "rationale"]);
    expect(JSON.stringify(view)).not.toMatch(/private-business-signal|private-evidence-gap|private\.example|confidence|evidenceUrls/);
  });
});
