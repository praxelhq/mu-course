import { describe, expect, it } from "vitest";
import {
  approvedAiProcessorsFromScoringPolicy,
  approvedAiProcessorsForAssessmentRelease,
  parseAssessmentPolicies,
  parseExportPolicy,
  parsePortfolioPolicy,
  parseScoringPolicy,
} from "../lib/assessment-policies";
import { mergePortfolioSlotDefinitions } from "../lib/portfolio";

describe("versioned assessment policy contract", () => {
  it("parses the policy shapes consumed by scoring, portfolio, publication, and exports", () => {
    expect(
      parseScoringPolicy({
        component: "workflow",
        approvedAiProcessors: ["anthropic"],
        dimensions: {
          usefulness: ["craft", "relevance"],
          execution: "functionality",
          ownership: "verification-evidence",
        },
      }),
    ).toEqual({
      component: "workflow",
      approvedAiProcessors: ["anthropic"],
      dimensions: {
        usefulness: ["craft", "relevance"],
        execution: "functionality",
        ownership: "verification-evidence",
      },
    });
    expect(parsePortfolioPolicy({ include: true, slot: "workflow" })).toEqual({
      include: true,
      slot: "workflow",
    });
    expect(
      parsePortfolioPolicy({
        include: true,
        slot: "data-memo",
        requiredPublicLink: { label: "Session 3 public-safe data memo" },
      }),
    ).toEqual({
      include: true,
      slot: "data-memo",
      requiredPublicLink: { label: "Session 3 public-safe data memo" },
    });
    expect(
      parseExportPolicy({
        praxy: { enabled: true, fieldKeys: ["workflowTitle", "gallerySummary"] },
        dpdp: { fieldKeys: ["workflowTitle"], evidenceRoles: ["workflowPngFile"] },
      }),
    ).toEqual({
      praxy: { enabled: true, fieldKeys: ["workflowTitle", "gallerySummary"] },
      dpdp: { fieldKeys: ["workflowTitle"], evidenceRoles: ["workflowPngFile"] },
    });
  });

  it("accepts only a bounded normalized immutable processor allowlist", () => {
    expect(
      approvedAiProcessorsFromScoringPolicy({
        component: "artifact-quality",
        approvedAiProcessors: ["anthropic"],
      }),
    ).toEqual(["anthropic"]);
    expect(
      parseScoringPolicy({
        component: "artifact-quality",
        approvedAiProcessors: ["Anthropic"],
      }),
    ).toBeNull();
    expect(
      parseScoringPolicy({
        component: "artifact-quality",
        approvedAiProcessors: ["anthropic", "anthropic"],
      }),
    ).toBeNull();
    expect(
      approvedAiProcessorsFromScoringPolicy({
        component: "artifact-quality",
        approvedAiProcessors: ["anthropic"],
        unreviewedProvider: "openai",
      }),
    ).toEqual([]);
  });

  it("lets a dataset narrow scoring authorization but never expand it", () => {
    expect(
      approvedAiProcessorsForAssessmentRelease({
        scoringPolicy: {
          component: "artifact-quality",
          approvedAiProcessors: ["anthropic", "openai"],
        },
        datasetApprovedAiProcessors: ["anthropic"],
      }),
    ).toEqual(["anthropic"]);
    expect(
      approvedAiProcessorsForAssessmentRelease({
        scoringPolicy: { component: "artifact-quality", unknown: true },
        datasetApprovedAiProcessors: ["anthropic"],
      }),
    ).toEqual([]);
    expect(
      approvedAiProcessorsForAssessmentRelease({
        scoringPolicy: { component: "artifact-quality" },
        datasetApprovedAiProcessors: ["anthropic"],
      }),
    ).toEqual([]);
    expect(
      approvedAiProcessorsForAssessmentRelease({
        scoringPolicy: {
          component: "artifact-quality",
          approvedAiProcessors: ["anthropic"],
        },
        datasetApprovedAiProcessors: ["anthropic", "BAD"],
      }),
    ).toEqual([]);
    expect(
      approvedAiProcessorsForAssessmentRelease({
        scoringPolicy: {
          component: "artifact-quality",
          approvedAiProcessors: ["anthropic"],
        },
        datasetApprovedAiProcessors: ["anthropic", "anthropic"],
      }),
    ).toEqual([]);
  });

  it("fails closed on unknown keys, missing workflow dimension bindings, and public blueprint actions", () => {
    expect(parseScoringPolicy({ component: "artifact-quality", slug: "data-memo" })).toBeNull();
    expect(parseScoringPolicy({ component: "workflow" })).toBeNull();
    expect(parsePortfolioPolicy({ include: true })).toBeNull();
    expect(
      parseExportPolicy({
        praxy: { enabled: true, fieldKeys: ["workflowTitle"] },
        dpdp: { fieldKeys: [], evidenceRoles: ["blueprintFile"] },
      }),
    ).toBeNull();
  });

  it("validates an explicit public-link requirement without changing legacy policies", () => {
    expect(parsePortfolioPolicy({ include: true, slot: "app" })).toEqual({
      include: true,
      slot: "app",
    });
    expect(
      parsePortfolioPolicy({
        include: true,
        slot: "data-memo",
        requiredPublicLink: { label: "   " },
      }),
    ).toBeNull();
    expect(
      parsePortfolioPolicy({
        include: false,
        slot: "data-memo",
        requiredPublicLink: { label: "Session 3 public-safe data memo" },
      }),
    ).toBeNull();
    expect(
      parsePortfolioPolicy({
        include: true,
        slot: "data-memo",
        requiredPublicLink: {
          label: "Session 3 public-safe data memo",
          allowHttp: true,
        },
      }),
    ).toBeNull();
  });

  it("rejects forbidden projection fields even when a version author tries to allowlist them", () => {
    const policies = parseAssessmentPolicies({
      purpose: "graded",
      scoringPolicy: { component: "artifact-quality" },
      portfolioPolicy: { include: true, slot: "data-memo" },
      publicationPolicy: {
        wall: "workflow",
        consentField: "galleryConsent",
        captionField: "gallerySummary",
        publicTextFields: ["workflowTitle", "promptLog"],
        previewRole: "workflowPngFile",
        actions: [],
      },
      exportPolicy: {
        praxy: { enabled: true, fieldKeys: ["workflowTitle"] },
        dpdp: { fieldKeys: ["workflowTitle"], evidenceRoles: ["workflowPngFile"] },
      },
    });
    expect(policies).toBeNull();
  });

  it("keeps formative work outside scoring and portfolio completeness", () => {
    const policies = parseAssessmentPolicies({
      purpose: "formative",
      scoringPolicy: { component: "none" },
      portfolioPolicy: { include: false, slot: "workflow-design" },
      publicationPolicy: {},
      exportPolicy: {
        praxy: { enabled: false, fieldKeys: [] },
        dpdp: { fieldKeys: ["flowchartSummary"], evidenceRoles: [] },
      },
    });
    expect(policies?.scoringPolicy.component).toBe("none");
    expect(policies?.portfolioPolicy.include).toBe(false);
  });

  it("replaces a legacy completeness slot from active version metadata instead of adding a duplicate", () => {
    const merged = mergePortfolioSlotDefinitions(
      [
        {
          kind: "legacy",
          slot: "data-memo",
          slug: "data-memo",
          title: "Legacy data memo",
          ownerKind: "individual",
        },
        {
          kind: "legacy",
          slot: "app",
          slug: "app",
          title: "Legacy app",
          ownerKind: "individual",
        },
        {
          kind: "legacy",
          slot: "workflow",
          slug: "workflow",
          title: "Legacy workflow",
          ownerKind: "team",
        },
      ],
      [
        {
          kind: "versioned",
          slot: "data-memo",
          assignmentId: "s3-data-memo",
          title: "Verified data memo",
          ownerKind: "individual",
          policy: {
            include: true,
            slot: "data-memo",
            requiredPublicLink: { label: "Session 3 public-safe data memo" },
          },
        },
        {
          kind: "versioned",
          slot: "app",
          assignmentId: "s4-app",
          title: "SignalShelf V1/V2",
          ownerKind: "individual",
          policy: { include: true, slot: "app" },
        },
      ],
    );
    expect(merged).toHaveLength(3);
    expect(merged.find((slot) => slot.slot === "data-memo")?.kind).toBe("versioned");
    expect(merged.find((slot) => slot.slot === "app")?.kind).toBe("versioned");
  });
});
