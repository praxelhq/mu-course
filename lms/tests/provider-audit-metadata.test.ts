import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderAuditMetadata,
  projectProviderAuditMetadata,
} from "../lib/assessments/provider-audit-metadata";

describe("provider audit metadata projection", () => {
  it("builds a metadata-only legacy grading log", () => {
    expect(
      buildProviderAuditMetadata({
        model: "legacy-model",
        usage: { inputTokens: 12, outputTokens: 5 },
      }),
    ).toEqual({
      model: "legacy-model",
      usage: { inputTokens: 12, outputTokens: 5 },
    });
  });

  it("allowlists hashes, model, usage, and citations from legacy prompt-log rows", () => {
    const privateAnchor = "PRIVATE EVALUATOR ANCHOR";
    const metadata = projectProviderAuditMetadata({
      hashes: { assessment: "assessment-hash", dataset: null, evaluator: "evaluator-hash" },
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 50 },
      citations: [{ dimension: "craft", evidenceIds: ["evidence-1"] }],
      system: privateAnchor,
      user: "PRIVATE LEARNER PROMPT",
      response: "PRIVATE RAW RESPONSE",
      raw: "PRIVATE RAW RESPONSE",
      auditContext: { system: privateAnchor },
    });

    expect(metadata).toEqual({
      hashes: { assessment: "assessment-hash", dataset: null, evaluator: "evaluator-hash" },
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 50 },
      citations: [{ dimension: "craft", evidenceIds: ["evidence-1"] }],
    });
    expect(JSON.stringify(metadata)).not.toContain("PRIVATE");
  });

  it("does not render old prompt-only rows as provider metadata", () => {
    expect(
      projectProviderAuditMetadata({
        system: "PRIVATE EVALUATOR ANCHOR",
        user: "PRIVATE LEARNER PROMPT",
        response: "PRIVATE RAW RESPONSE",
      }),
    ).toBeNull();
  });

  it("routes instructor prompt-log rendering through the metadata projection", () => {
    const page = readFileSync(
      new URL("../app/instructor/submissions/[id]/page.tsx", import.meta.url),
      "utf8",
    );

    expect(page).toContain("projectProviderAuditMetadata(g.promptLog)");
    expect(page).not.toMatch(/promptLog\.(?:system|user|response)/u);
    expect(page).not.toContain("JSON.stringify(g.promptLog");
  });
});
