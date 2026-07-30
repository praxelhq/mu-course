import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAssessmentAnchorPack } from "../lib/assessments/assessment-anchors";
import {
  runAssessmentEvaluation,
  type PersistedAssessmentGrade,
} from "../lib/assessments/run-evaluation";
import { assertAssessmentEvaluatorChecksum } from "../lib/assessments/assessment-anchors";
import {
  S4_APP_INSPECTION_POLICY_V1,
  applyS4AppGradingDecision,
  buildS4AppGradingDecision,
  parseS4AcceptanceStatuses,
  parseS4AppInspectionPolicy,
  s4InspectionEvidenceSummary,
  sha256Json,
  type S4AppInspectionArtifact,
} from "../lib/assessments/s4-app-policy";
import { inspectS4App } from "../worker/jobs/s4-app-inspection";
import {
  handleGradeSubmission,
  prepareS4ContextScreening,
} from "../worker/jobs/grade-submission";

function jsonRecordForFixture(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function inspectableArtifact(
  overrides: Partial<S4AppInspectionArtifact> = {},
): S4AppInspectionArtifact {
  return {
    schemaVersion: 1,
    policyId: "s4-artifact-inspection-v1",
    policySha256: sha256Json(S4_APP_INSPECTION_POLICY_V1),
    binding: {
      submissionId: "submission-s4-v1",
      assessmentVersionId: "assess_s4_app_v1",
      assessmentSha256: "b".repeat(64),
      evaluatorSha256: "c".repeat(64),
      submissionVersion: 1,
      attempt: 1,
    },
    sourceContext: null,
    previousArtifactSha256: null,
    inspectedAt: "2026-07-30T10:00:00.000Z",
    submittedUrl: "https://signalshelf.lovable.app/",
    submittedUrlSha256: "7".repeat(64),
    finalUrl: "https://signalshelf.lovable.app/",
    finalUrlSha256: "8".repeat(64),
    state: "inspectable",
    httpStatus: 200,
    document: {
      contentType: "text/html; charset=utf-8",
      byteCount: 1024,
      sha256: "d".repeat(64),
    },
    render: {
      domSha256: "e".repeat(64),
      screenshotSha256: "f".repeat(64),
      screenshotByteCount: 2048,
      bodyTextLength: 500,
      interactiveControlCount: 8,
      editableControlCount: 3,
      publicLinkCount: 4,
      mobileNoHorizontalScroll: true,
      renderedAnalyticsClaim: false,
      analyticsLabelledDemo: true,
      sensitiveFindingCount: 0,
      sensitiveFindingCategories: [],
      sensitiveTextSha256: null,
    },
    acceptance: {
      statuses: { "AT-01": "PASS", "AT-11": "PASS", "AT-12": "PASS" },
      referencedIds: ["AT-01", "AT-11", "AT-12"],
      corePassCount: 3,
      publishAccessPassCount: 0,
    },
    repositoryCheck: null,
    sourceChecks: [],
    evidence: { cleanEvidenceCount: 1, screenshotReceiptSha256: "1".repeat(64) },
    artifactSha256: "2".repeat(64),
    ...overrides,
  };
}

const highModelGrade = {
  rubricScores: {
    functionality: { score: 10, rationale: "Everything works." },
    craft: { score: 10, rationale: "Intentional craft." },
    relevance: { score: 10, rationale: "Strong relevance." },
    "verification-evidence": { score: 10, rationale: "Complete verification." },
  },
  total: 40,
  feedbackMd: "Strong work.",
  confidence: 0.95,
  flags: [] as string[],
};

describe("Session 4 frozen app-inspection policy", () => {
  it("rejects altered or incomplete immutable policy objects", () => {
    expect(parseS4AppInspectionPolicy(S4_APP_INSPECTION_POLICY_V1)).toEqual(
      S4_APP_INSPECTION_POLICY_V1,
    );
    expect(
      parseS4AppInspectionPolicy({
        ...S4_APP_INSPECTION_POLICY_V1,
        caps: {
          ...S4_APP_INSPECTION_POLICY_V1.caps,
          deadOrBlockedFunctionality: 10,
        },
      }),
    ).toBeNull();
    expect(parseS4AppInspectionPolicy({ policyId: "s4-artifact-inspection-v1" })).toBeNull();
  });

  it.each([
    ["AT-01 PARTIAL\nAT-01 NOT RUN", "NOT RUN"],
    ["AT-01 NOT RUN\nAT-01 PARTIAL", "NOT RUN"],
    ["AT-01 PASS\nAT-01 FAIL", "FAIL"],
    ["AT-01 FAIL\nAT-01 PASS", "FAIL"],
  ] as const)("resolves conflicting acceptance claims independent of order", (log, expected) => {
    expect(parseS4AcceptanceStatuses(log)["AT-01"]).toBe(expected);
  });

  it("binds the artifact digest to assessment/evaluator version and screenshot bytes", async () => {
    const inspect = (evaluatorSha256: string, screenshot: Uint8Array) =>
      inspectS4App(
        {
          submissionId: "submission-s4-v1",
          assessmentVersionId: "assess_s4_app_v1",
          assessmentSha256: "b".repeat(64),
          evaluatorSha256,
          submissionVersion: 1,
          attempt: 1,
          appUrl: "https://signalshelf.lovable.app",
          githubUrl: null,
          acceptanceTestLog: "AT-01 PASS — mobile works",
          cleanEvidenceCount: 1,
          screenshotReceiptSha256: "1".repeat(64),
          sourceUrls: [],
          sourceContext: null,
          previousArtifactSha256: null,
        },
        {
          policy: S4_APP_INSPECTION_POLICY_V1,
          now: () => new Date("2026-07-30T10:00:00.000Z"),
          lookup: async () => [{ address: "93.184.216.34", family: 4 }],
          fetchImpl: vi.fn(async () =>
            new Response("<!doctype html><html><body><div id='root'></div></body></html>", {
              status: 200,
              headers: { "content-type": "text/html; charset=utf-8" },
            }),
          ),
          render: vi.fn(async () => ({
            domStructure: "main>form>input+button+a",
            screenshot,
            bodyTextLength: 120,
            interactiveControlCount: 3,
            editableControlCount: 1,
            publicLinkCount: 1,
            mobileNoHorizontalScroll: true,
            renderedAnalyticsClaim: false,
            analyticsLabelledDemo: true,
            sensitiveText: "Fictional demo content only.",
          })),
        },
      );

    const first = await inspect("c".repeat(64), new Uint8Array([1, 2, 3]));
    const same = await inspect("c".repeat(64), new Uint8Array([1, 2, 3]));
    const otherEvaluator = await inspect("9".repeat(64), new Uint8Array([1, 2, 3]));
    const otherScreenshot = await inspect("c".repeat(64), new Uint8Array([1, 2, 4]));

    expect(first.state).toBe("inspectable");
    expect(first.artifactSha256).toBe(same.artifactSha256);
    expect(first.artifactSha256).not.toBe(otherEvaluator.artifactSha256);
    expect(first.artifactSha256).not.toBe(otherScreenshot.artifactSha256);
    expect(first.render?.screenshotSha256).not.toBe(otherScreenshot.render?.screenshotSha256);
  });

  it("blocks private destinations before rendering and caps functionality", async () => {
    const render = vi.fn();
    const artifact = await inspectS4App(
      {
        submissionId: "submission-private",
        assessmentVersionId: "assess_s4_app_v1",
        assessmentSha256: "b".repeat(64),
        evaluatorSha256: "c".repeat(64),
        submissionVersion: 1,
        attempt: 1,
        appUrl: "http://10.0.0.5/internal",
        githubUrl: null,
        acceptanceTestLog: "AT-01 PASS",
        cleanEvidenceCount: 1,
        screenshotReceiptSha256: null,
        sourceUrls: [],
        sourceContext: null,
        previousArtifactSha256: null,
      },
      { policy: S4_APP_INSPECTION_POLICY_V1, render },
    );
    const decision = buildS4AppGradingDecision({
      artifact,
      fields: {},
      unsafeEvidence: false,
      previousAcceptance: {},
    });
    const grade = applyS4AppGradingDecision(highModelGrade, decision);

    expect(render).not.toHaveBeenCalled();
    expect(artifact.state).toBe("blocked");
    expect(grade.rubricScores.functionality.score).toBe(3);
    expect(grade.flags).toEqual(expect.arrayContaining(["link-dead", "low-confidence"]));
  });

  it("locally holds rendered PII or secrets without persisting the rendered text", async () => {
    const secret = "sk_live_1234567890abcdef";
    const artifact = await inspectS4App(
      {
        submissionId: "submission-rendered-sensitive",
        assessmentVersionId: "assess_s4_app_v1",
        assessmentSha256: "b".repeat(64),
        evaluatorSha256: "c".repeat(64),
        submissionVersion: 1,
        attempt: 1,
        appUrl: "https://signalshelf.lovable.app",
        githubUrl: null,
        acceptanceTestLog: "AT-01 PASS",
        cleanEvidenceCount: 1,
        screenshotReceiptSha256: "1".repeat(64),
        sourceUrls: [],
        sourceContext: null,
        previousArtifactSha256: null,
      },
      {
        policy: S4_APP_INSPECTION_POLICY_V1,
        now: () => new Date("2026-07-30T10:00:00.000Z"),
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
        fetchImpl: vi.fn(async () =>
          new Response("<!doctype html><html><body><main>App</main></body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
        render: vi.fn(async () => ({
          domStructure: "main>form>input+button+a",
          screenshot: new Uint8Array([1, 2, 3]),
          bodyTextLength: 120,
          interactiveControlCount: 3,
          editableControlCount: 1,
          publicLinkCount: 1,
          mobileNoHorizontalScroll: true,
          renderedAnalyticsClaim: false,
          analyticsLabelledDemo: true,
          sensitiveText:
            `https://example.com/invisible?email=real.person%40company.com&apiKey=${secret}`,
        })),
      },
    );
    const decision = buildS4AppGradingDecision({
      artifact,
      fields: {},
      unsafeEvidence: false,
      previousAcceptance: {},
    });

    expect(artifact.render).toMatchObject({
      sensitiveFindingCount: expect.any(Number),
      sensitiveFindingCategories: expect.arrayContaining(["email", "secret-token"]),
      sensitiveTextSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(artifact.render!.sensitiveFindingCount).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(artifact)).not.toContain("real.person");
    expect(JSON.stringify(artifact)).not.toContain(secret);
    expect(decision).toMatchObject({
      stopAutomatedGrading: true,
      suppressGallery: true,
      flags: expect.arrayContaining(["privacy-security-hold"]),
    });
  });

  it.each([
    ["dead", "link-dead"],
    ["static", "static-shell"],
    ["uninspectable", "app-uninspectable"],
  ] as const)("prevents a %s app from retaining an uncapped model score", (state, flag) => {
    const artifact = inspectableArtifact({
      state,
      httpStatus: state === "dead" ? 404 : 200,
      render: state === "dead" ? null : inspectableArtifact().render,
    });
    const decision = buildS4AppGradingDecision({
      artifact,
      fields: {},
      unsafeEvidence: false,
      previousAcceptance: {},
    });
    const grade = applyS4AppGradingDecision(highModelGrade, decision);

    expect(grade.rubricScores.functionality.score).toBe(3);
    expect(grade.flags).toContain(flag);
    expect(grade.total).toBeLessThan(40);
  });

  it("does not cap visibly labelled browser-local analytics", () => {
    const artifact = inspectableArtifact({
      render: {
        ...inspectableArtifact().render!,
        renderedAnalyticsClaim: true,
        analyticsLabelledDemo: true,
      },
    });
    const decision = buildS4AppGradingDecision({
      artifact,
      fields: {
        industryCompanyApplication:
          "A fictional creator in the team's retail context uses the page to prioritize public product education and a demo consultation route.",
        nonAffiliationConfirmation: "I CONFIRM",
      },
      unsafeEvidence: false,
      previousAcceptance: {},
    });

    expect(decision.flags).not.toContain("mock-ambiguity");
    expect(decision.caps).not.toContainEqual({ dimension: "verification-evidence", max: 5 });
  });

  it("caps copied golden work without owned decisions and missing industry transfer", () => {
    const decision = buildS4AppGradingDecision({
      artifact: inspectableArtifact(),
      fields: {
        firstPrompt:
          "Plan an original educational web app called SignalShelf. The payload has schemaVersion, creator, blocks, and theme. Label Demo analytics · this browser only. Map AT-01 through AT-18.",
        approvedPlanSummary: "No changes; used as-is.",
        industryCompanyApplication: "Generic fixture.",
        nonAffiliationConfirmation: "I CONFIRM",
      },
      unsafeEvidence: false,
      previousAcceptance: {},
    });

    expect(decision.caps).toEqual(
      expect.arrayContaining([
        { dimension: "craft", max: 6 },
        { dimension: "relevance", max: 6 },
      ]),
    );
  });

  it("binds a V2 GitHub repository liveness check without retaining its path", async () => {
    const repositoryUrl = "https://github.com/student-team/secret-project";
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.startsWith("https://github.com/")) {
        expect(init?.method).toBe("HEAD");
        return new Response(null, { status: 200 });
      }
      return new Response("<!doctype html><html><body><main>App</main></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;
    const artifact = await inspectS4App(
      {
        submissionId: "submission-s4-v2",
        assessmentVersionId: "assess_s4_app_v1",
        assessmentSha256: "b".repeat(64),
        evaluatorSha256: "c".repeat(64),
        submissionVersion: 2,
        attempt: 1,
        appUrl:
          "https://signalshelf.lovable.app/public/demo?email=real.person%40company.com#profile=secret",
        githubUrl: repositoryUrl,
        acceptanceTestLog: "AT-01 PASS",
        cleanEvidenceCount: 1,
        screenshotReceiptSha256: "1".repeat(64),
        sourceUrls: [],
        sourceContext: null,
        previousArtifactSha256: null,
      },
      {
        policy: S4_APP_INSPECTION_POLICY_V1,
        now: () => new Date("2026-07-30T10:00:00.000Z"),
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
        fetchImpl,
        render: vi.fn(async () => ({
          domStructure: "main>form>input+button+a",
          screenshot: new Uint8Array([1, 2, 3]),
          bodyTextLength: 120,
          interactiveControlCount: 3,
          editableControlCount: 1,
          publicLinkCount: 1,
          mobileNoHorizontalScroll: true,
          renderedAnalyticsClaim: false,
          analyticsLabelledDemo: true,
          sensitiveText: "Fictional demo content only.",
        })),
      },
    );

    expect(artifact.repositoryCheck).toMatchObject({
      ok: true,
      status: 200,
      finalHost: "github.com",
      urlHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(artifact)).not.toContain("student-team");
    expect(JSON.stringify(artifact)).not.toContain("secret-project");
    expect(artifact.submittedUrl).toBe("https://signalshelf.lovable.app/public/demo");
    expect(artifact.finalUrl).toBe("https://signalshelf.lovable.app/public/demo");
    expect(JSON.stringify(artifact)).not.toContain("real.person");
    expect(JSON.stringify(artifact)).not.toContain("profile=secret");
    expect(artifact.submittedUrlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.finalUrlSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("holds a V2 verification score when repository evidence is unavailable", () => {
    const artifact = inspectableArtifact({
      binding: { ...inspectableArtifact().binding, submissionVersion: 2 },
      repositoryCheck: null,
    });
    const decision = buildS4AppGradingDecision({
      artifact,
      fields: {
        industryCompanyApplication:
          "A fictional retail creator uses the page to prioritize product education and a demo consultation route for public audiences.",
        nonAffiliationConfirmation: "I CONFIRM",
      },
      unsafeEvidence: false,
      previousAcceptance: {},
    });

    expect(decision.caps).toContainEqual({ dimension: "verification-evidence", max: 3 });
    expect(decision.flags).toEqual(expect.arrayContaining(["source-unreachable", "low-confidence"]));
  });

  it("never sends URL query or fragment data in the provider inspection summary", () => {
    const artifact = inspectableArtifact({
      finalUrl:
        "https://signalshelf.lovable.app/public/demo?email=real.person@company.com#profile=secret",
    });
    const decision = buildS4AppGradingDecision({
      artifact,
      fields: {},
      unsafeEvidence: false,
      previousAcceptance: {},
    });
    const summary = s4InspectionEvidenceSummary(artifact, decision).text;

    expect(summary).toContain("final host signalshelf.lovable.app");
    expect(summary).not.toContain("real.person");
    expect(summary).not.toContain("profile=");
    expect(summary).not.toContain("/public/demo");
  });

  it("withholds checkpoint context and emits redacted repair feedback on local safety findings", () => {
    const secret = "sk_live_1234567890abcdef";
    const screening = prepareS4ContextScreening({
      sourceFields: {
        firstPrompt: `Build the app with apiKey=${secret}`,
        benchmarkSourceLinks:
          "https://example.com/revenue?email=real.person%40company.com#private",
      },
      currentFields: {
        appUrl:
          "https://signalshelf.lovable.app/public/demo?email=another.person%40company.com#profile=private",
      },
      currentJudgmentFieldIds: [],
      appUrlField: "appUrl",
      repositoryField: "githubUrl",
    });

    expect(screening.evidence).toEqual([]);
    expect(screening.findings.map((finding) => finding.detector)).toEqual(
      expect.arrayContaining(["secret-token", "sensitive-key", "email"]),
    );
    expect(screening.repairFeedback).toContain("withheld before AI processing");
    expect(screening.repairFeedback).not.toContain(secret);
    expect(screening.repairFeedback).not.toContain("real.person");
    expect(screening.repairFeedback).not.toContain("another.person");
  });
});

describe("S4-GF-01 through S4-GF-06", () => {
  const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), "fixtures/grading/s4-app-policy.json"), "utf8"),
  ) as {
    fixtures: Array<{
      id: string;
      input: Record<string, unknown>;
      expected: {
        flags: string[];
        caps: Array<{ dimension: string; max: number }>;
        confidenceMax?: number;
        stopAutomatedGrading?: boolean;
        suppressGallery?: boolean;
      };
    }>;
  };

  it.each(fixture.fixtures)("enforces $id", ({ id, input, expected }) => {
    const repositoryInput = jsonRecordForFixture(input.repositoryCheck);
    const base = inspectableArtifact({
      state: (input.inspectionState as S4AppInspectionArtifact["state"] | undefined) ??
        "inspectable",
      render: {
        ...inspectableArtifact().render!,
        renderedAnalyticsClaim: input.renderedAnalyticsClaim === true,
        analyticsLabelledDemo: false,
      },
      binding: {
        ...inspectableArtifact().binding,
        submissionVersion:
          typeof input.submissionVersion === "number" ? input.submissionVersion : 1,
      },
      acceptance: {
        ...inspectableArtifact().acceptance,
        statuses:
          (input.currentAcceptance as Record<string, "PASS" | "FAIL"> | undefined) ??
          inspectableArtifact().acceptance.statuses,
      },
      sourceChecks:
        (input.sourceChecks as Array<{ urlHash: string; ok: boolean; status: number }> | undefined)?.map(
          (check, index) => ({
            urlHash: check.urlHash ?? String(index).padStart(64, "0"),
            ok: check.ok,
            status: check.status ?? 0,
          }),
        ) ?? [],
      repositoryCheck: input.repositoryCheck
        ? {
            urlHash: "6".repeat(64),
            ok: repositoryInput.ok === true,
            status:
              typeof repositoryInput.status === "number"
                ? Number(repositoryInput.status)
                : 0,
            finalHost:
              typeof repositoryInput.finalHost === "string"
                ? String(repositoryInput.finalHost)
                : null,
          }
        : null,
    });
    const decision = buildS4AppGradingDecision({
      artifact: base,
      fields: {
        approvedPlanSummary:
          "I changed the generated plan to prioritize one creator-to-public path, visible demo labels, and a smaller mobile-safe interaction sequence.",
        firstPrompt: "Build an original student-authored creator page.",
        industryCompanyApplication:
          "A fictional retail creator uses this public page to prioritize product education, gather browser-local demo signals, and route visitors toward a consultation.",
        nonAffiliationConfirmation: "I CONFIRM",
        knownLimitations: input.knownLimitations,
        acceptanceTestLog: input.acceptanceTestLog,
      },
      unsafeEvidence: input.unsafeEvidence === true,
      previousAcceptance:
        (input.previousAcceptance as Record<string, "PASS" | "FAIL"> | undefined) ?? {},
    });

    expect(decision.fixtureIds).toEqual([id]);
    expect(decision.flags).toEqual([...expected.flags].sort());
    expect(decision.caps).toEqual(
      [...expected.caps].sort((left, right) => left.dimension.localeCompare(right.dimension)),
    );
    if (expected.confidenceMax !== undefined) {
      expect(decision.confidenceMax).toBeLessThanOrEqual(expected.confidenceMax);
    }
    expect(decision.stopAutomatedGrading).toBe(expected.stopAutomatedGrading ?? false);
    expect(decision.suppressGallery).toBe(expected.suppressGallery ?? false);

    if (!decision.stopAutomatedGrading) {
      const grade = applyS4AppGradingDecision(highModelGrade, decision);
      for (const cap of expected.caps) {
        expect(
          (grade.rubricScores as Record<string, { score: number }>)[cap.dimension]?.score,
        ).toBeLessThanOrEqual(cap.max);
      }
    }
  });
});

describe("Session 4 grade-policy runtime hook", () => {
  it("preserves the validated provider result but persists the deterministically capped grade", async () => {
    const artifact = inspectableArtifact({ state: "dead", httpStatus: 404, render: null });
    const decision = buildS4AppGradingDecision({
      artifact,
      fields: {
        note: "Submitted evidence.",
        industryCompanyApplication:
          "A fictional retail creator uses this public page to prioritize product education and a demo consultation route for public audiences.",
        nonAffiliationConfirmation: "I CONFIRM",
      },
      unsafeEvidence: false,
      previousAcceptance: {},
    });
    const complete = vi.fn(async () => undefined);
    const anchors = createAssessmentAnchorPack({
      safeForProcessor: true,
      dimensions: [
        {
          key: "functionality",
          bands: [
            { key: "emerging", min: 0, max: 3, criteria: ["No inspectable app exists."] },
            { key: "established", min: 4, max: 10, criteria: ["The app is inspectable."] },
          ],
          caps: [],
          safeExamples: [
            {
              key: "functionality-example",
              bandKey: "established",
              source: "authored-abstract",
              summary: "The public app exposes an observable creator-to-public journey.",
            },
          ],
        },
      ],
    });

    await runAssessmentEvaluation(
      {
        evaluationKey: "assessment:s4-policy:v1:a1",
        submissionId: "s4-policy",
        assessmentTitle: "S4 app",
        purpose: "graded",
        fields: { note: "Submitted evidence." },
        answerSpecs: {},
        judgmentFieldIds: ["note"],
        trustedAggregateSummaries: [],
        rubric: [{ key: "functionality", label: "Functionality", max: 10 }],
        hashes: { assessment: "assessment", dataset: null, evaluator: "evaluator" },
        approvedFlags: ["link-dead", "low-confidence"],
        anchors,
        gradePolicy: (grade) => applyS4AppGradingDecision(grade, decision),
      },
      {
        persistence: {
          claim: vi.fn(async () => ({ kind: "claimed" as const, claimToken: "claim" })),
          persistDeterministic: vi.fn(async () => undefined),
          requireRepair: vi.fn(async () => undefined),
          complete,
          fail: vi.fn(async () => undefined),
        },
        callProvider: vi.fn(async () => ({
          rubricScores: {
            functionality: {
              score: 10,
              rationale: "The submitted claim says all tests pass.",
              anchorBand: "established",
            },
          },
          total: 10,
          feedbackMd: "Check the live result.",
          confidence: 0.95,
          flags: [],
          citations: [{ dimension: "functionality", evidenceIds: ["note"] }],
          usage: { inputTokens: 10, outputTokens: 10 },
          model: "test-model",
          raw: "private raw response",
        })),
      },
    );

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          rubricScores: expect.objectContaining({
            functionality: expect.objectContaining({ score: 10 }),
          }),
        }),
        grade: expect.objectContaining({
          rubricScores: expect.objectContaining({
            functionality: expect.objectContaining({ score: 3 }),
          }),
          total: 3,
          flags: expect.arrayContaining(["link-dead", "low-confidence"]),
        }),
      }),
    );
  });

  it.each([
    {
      name: "widens a score",
      change: (grade: PersistedAssessmentGrade): PersistedAssessmentGrade => ({
        ...grade,
        rubricScores: {
          functionality: { ...grade.rubricScores.functionality, score: 6 },
        },
      }),
    },
    {
      name: "removes a provider flag",
      change: (grade: PersistedAssessmentGrade): PersistedAssessmentGrade => ({
        ...grade,
        flags: [],
      }),
    },
    {
      name: "adds an unapproved flag",
      change: (grade: PersistedAssessmentGrade): PersistedAssessmentGrade => ({
        ...grade,
        flags: [...grade.flags, "invented-policy"],
      }),
    },
    {
      name: "rewrites provider feedback",
      change: (grade: PersistedAssessmentGrade): PersistedAssessmentGrade => ({
        ...grade,
        feedbackMd: "Policy-authored replacement feedback.",
      }),
    },
  ])("rejects a deterministic policy that $name", async ({ change }) => {
    const anchors = createAssessmentAnchorPack({
      safeForProcessor: true,
      dimensions: [
        {
          key: "functionality",
          bands: [
            { key: "emerging", min: 0, max: 3, criteria: ["No inspectable app exists."] },
            { key: "established", min: 4, max: 10, criteria: ["The app is inspectable."] },
          ],
          caps: [],
          safeExamples: [
            {
              key: "functionality-example",
              bandKey: "established",
              source: "authored-abstract",
              summary: "The public app exposes an observable journey.",
            },
          ],
        },
      ],
    });
    const fail = vi.fn(async () => undefined);

    await expect(
      runAssessmentEvaluation(
        {
          evaluationKey: "assessment:s4-invalid-policy:v1:a1",
          submissionId: "s4-invalid-policy",
          assessmentTitle: "S4 app",
          purpose: "graded",
          fields: { note: "Submitted evidence." },
          answerSpecs: {},
          judgmentFieldIds: ["note"],
          trustedAggregateSummaries: [],
          rubric: [{ key: "functionality", label: "Functionality", max: 10 }],
          hashes: { assessment: "assessment", dataset: null, evaluator: "evaluator" },
          approvedFlags: ["link-dead", "low-confidence"],
          anchors,
          gradePolicy: change,
        },
        {
          persistence: {
            claim: vi.fn(async () => ({ kind: "claimed" as const, claimToken: "claim" })),
            persistDeterministic: vi.fn(async () => undefined),
            requireRepair: vi.fn(async () => undefined),
            complete: vi.fn(async () => undefined),
            fail,
          },
          callProvider: vi.fn(async () => ({
            rubricScores: {
              functionality: {
                score: 5,
                rationale: "The submitted app evidence is inspectable.",
                anchorBand: "established",
              },
            },
            total: 5,
            feedbackMd: "Check the live result.",
            confidence: 0.9,
            flags: ["link-dead"],
            citations: [{ dimension: "functionality", evidenceIds: ["note"] }],
            usage: { inputTokens: 10, outputTokens: 10 },
            model: "test-model",
            raw: "private raw response",
          })),
        },
      ),
    ).rejects.toMatchObject({ code: "grade-policy-invalid" });
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "grade-policy-invalid" }),
    );
  });

  it("persists the bound inspection artifact and creates holds from its capped grade", async () => {
    const anchors = createAssessmentAnchorPack({
      safeForProcessor: true,
      dimensions: [
        {
          key: "functionality",
          bands: [
            { key: "emerging", min: 0, max: 3, criteria: ["No inspectable app exists."] },
            { key: "established", min: 4, max: 10, criteria: ["The app is inspectable."] },
          ],
          caps: [],
          safeExamples: [
            {
              key: "functionality-example",
              bandKey: "established",
              source: "authored-abstract",
              summary: "The app exposes an observable creator-to-public journey.",
            },
          ],
        },
      ],
    });
    const approvedFlags = Object.values(S4_APP_INSPECTION_POLICY_V1.flags);
    const evaluatorJson = {
      config: {
        policyId: "s4-artifact-v1",
        appInspectionPolicy: S4_APP_INSPECTION_POLICY_V1,
        providerMode: "auto",
        approvedProcessor: "anthropic",
        approvedFlags,
        citationsPerDimension: 1,
        judgmentFieldIds: ["approvedPlanSummary"],
      },
      answerKey: null,
      anchors,
      normalization: { dimensionMin: 0, dimensionMax: 10, totalMax: 10 },
    };
    const artifact = inspectableArtifact({
      state: "dead",
      httpStatus: 404,
      render: null,
      acceptance: {
        statuses: Object.fromEntries(
          Array.from({ length: 18 }, (_, index) => [
            `AT-${String(index + 1).padStart(2, "0")}`,
            "PASS",
          ]),
        ) as Record<string, "PASS">,
        referencedIds: Array.from(
          { length: 18 },
          (_, index) => `AT-${String(index + 1).padStart(2, "0")}`,
        ),
        corePassCount: 15,
        publishAccessPassCount: 3,
      },
    });
    const inspect = vi.fn(async () => artifact);
    const deterministicWrites: Array<Record<string, unknown>> = [];
    const grades: Array<Record<string, unknown>> = [];
    const holds: Array<Record<string, unknown>> = [];
    const repairWrites: Array<Record<string, unknown>> = [];
    const sourceLookup = vi.fn(async (): Promise<Record<string, unknown> | null> => ({
      id: "submission-s4-plan-v1",
      assessmentVersionId: "assess_s4_product_prompt_v1",
      contentHash: "9".repeat(64),
      fields: {
        selectedProduct: "A fictional creator page builder",
        benchmarkSourceLinks: "https://example.com/source",
        selectionRationale:
          "The product has a compact creator-to-public journey that can be rebuilt and verified within the workshop while preserving meaningful product decisions.",
        industryCompanyApplication:
          "A fictional retail creator uses the page to prioritize public product education and a demo consultation route.",
        featureContract:
          "Core: edit and publish a page. Mocked: browser-local labelled analytics. Out of scope: accounts, billing, and third-party writes.",
        firstPrompt: "An original student-authored prompt.",
        nonAffiliationConfirmation: "I CONFIRM",
      },
    }));
    const db: Record<string, unknown> = {
      submission: {
        findUnique: vi.fn(async () => ({
          id: "submission-s4-v1",
          assignmentId: "asg_s4_app",
          userId: "student-1",
          status: "submitted",
          version: 1,
          attempt: 1,
          ownerKind: "individual",
          ownerId: "student-1",
          contentHash: "8".repeat(64),
          fields: {
            appUrl: "https://signalshelf.lovable.app",
            approvedPlanSummary: "I removed authentication and added visible demo labels.",
            acceptanceTestLog: artifact.acceptance.referencedIds
              .map((id) => `${id} PASS`)
              .join("\n"),
            knownLimitations: "Analytics are browser-local demo data.",
            nonAffiliationConfirmation: "I CONFIRM",
          },
          assessmentVersionId: "assess_s4_app_v1",
          assignment: {
            title: "Lovable app",
            contractMode: "versioned",
            assignmentType: {},
          },
          assessmentVersion: {
            id: "assess_s4_app_v1",
            purpose: "graded",
            publicSchema: {
              fields: [
                { key: "appUrl", label: "App", kind: "link", required: true },
                {
                  key: "approvedPlanSummary",
                  label: "Plan",
                  kind: "writeup",
                  required: true,
                },
                {
                  key: "acceptanceTestLog",
                  label: "Tests",
                  kind: "writeup",
                  required: true,
                },
                {
                  key: "knownLimitations",
                  label: "Limits",
                  kind: "writeup",
                  required: true,
                },
                {
                  key: "nonAffiliationConfirmation",
                  label: "Disclosure",
                  kind: "text",
                  required: true,
                },
              ],
            },
            rubric: {
              dimensions: [{ key: "functionality", label: "Functionality", max: 10 }],
            },
            scoringPolicy: {
              component: "artifact-quality",
              approvedAiProcessors: ["anthropic"],
            },
            checksumSha256: "b".repeat(64),
            evaluatorConfig: {
              ...evaluatorJson,
              checksumSha256: assertAssessmentEvaluatorChecksum({
                ...evaluatorJson,
                expectedSha256: null,
              }),
            },
            datasetRelease: null,
          },
          evidence: [],
        })),
        findFirst: sourceLookup,
        update: vi.fn(async () => ({})),
      },
      assessmentResult: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: "result-s4",
          evaluationKey: data.evaluationKey,
          status: "claimed",
          claimToken: data.claimToken,
          claimedAt: data.claimedAt,
        })),
        findFirst: vi.fn(async () => null),
        updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.deterministicResult) deterministicWrites.push(data);
          if (data.status === "repair_required") repairWrites.push(data);
          return { count: 1 };
        }),
      },
      configKV: { findUnique: vi.fn(async () => null) },
      grade: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          grades.push(data);
          return { id: "grade-s4" };
        }),
      },
      gradeHold: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          holds.push(data);
          return { id: "repair-hold-s4" };
        }),
        createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
          holds.push(...data);
          return { count: data.length };
        }),
      },
      costLog: { create: vi.fn(async () => ({})) },
      notification: { create: vi.fn(async () => ({})) },
    };
    db.$transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db));
    const model = vi.fn(async (request: unknown) => {
      void request;
      return {
        data: {
          rubricScores: {
            functionality: {
              score: 10,
              rationale: "All submitted tests claim PASS.",
              anchorBand: "established",
            },
          },
          total: 10,
          feedbackMd: "Verify the live app.",
          confidence: 0.95,
          flags: [],
          citations: [{ dimension: "functionality", evidenceIds: ["approvedPlanSummary"] }],
        },
        usage: { inputTokens: 10, outputTokens: 10 },
        model: "test-model",
        raw: "private raw response",
        retries: 0,
      };
    });

    const gradeDeps = {
      prisma: db as never,
      inspectS4App: inspect,
      model,
      fetchImpl: vi.fn(async () => new Response("source", { status: 200 })),
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      claimToken: () => "claim-s4",
      now: () => new Date("2026-07-30T10:00:00.000Z"),
    } as never;

    await handleGradeSubmission("submission-s4-v1", gradeDeps);

    expect(inspect).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: "submission-s4-v1",
        assessmentVersionId: "assess_s4_app_v1",
        evaluatorSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        githubUrl: null,
      }),
      expect.objectContaining({ policy: S4_APP_INSPECTION_POLICY_V1 }),
    );
    expect(deterministicWrites[0]?.deterministicResult).toMatchObject({
      appInspection: expect.objectContaining({ artifactSha256: artifact.artifactSha256 }),
      appInspectionDecision: expect.objectContaining({
        caps: expect.arrayContaining([{ dimension: "functionality", max: 3 }]),
      }),
    });
    expect(grades[0]).toMatchObject({
      total: 3,
      rubricScores: { functionality: expect.objectContaining({ score: 3 }) },
      flags: expect.arrayContaining(["link-dead", "low-confidence"]),
    });
    expect(holds.map((hold) => hold.code)).toEqual(
      expect.arrayContaining(["link-dead", "low-confidence"]),
    );
    const providerRequest = model.mock.calls[0]?.[0] as { user: string };
    expect(providerRequest.user).toContain("s4-source-context:firstPrompt");
    expect(providerRequest.user).toContain("s4-source-context:industryCompanyApplication");
    expect(providerRequest.user).toContain("public source host=example.com");
    expect(providerRequest.user).not.toContain("https://example.com/source");

    sourceLookup.mockResolvedValueOnce(null);
    model.mockClear();
    inspect.mockClear();
    await handleGradeSubmission("submission-s4-v1", gradeDeps);

    expect(model).not.toHaveBeenCalled();
    expect(inspect).toHaveBeenCalledWith(
      expect.objectContaining({ sourceContext: null, sourceUrls: [] }),
      expect.anything(),
    );
    expect(repairWrites.at(-1)).toMatchObject({
      status: "repair_required",
      errorCode: "source-context-missing",
      scoreable: false,
      publishable: false,
    });
  });
});
