import { canonicalJson, sha256CanonicalJson } from "../canonical-json";

export { canonicalJson } from "../canonical-json";

export const S4_APP_INSPECTION_POLICY_V1 = {
  schemaVersion: 1,
  policyId: "s4-artifact-inspection-v1",
  fixturePolicyId: "s4-gf-01-06-v1",
  appUrlField: "appUrl",
  allowedFinalHosts: ["*.lovable.app"],
  repository: {
    field: "githubUrl",
    requiredFromVersion: 2,
    allowedFinalHost: "github.com",
  },
  sourceContext: {
    assessmentVersionId: "assess_s4_product_prompt_v1",
    sourceUrlField: "benchmarkSourceLinks",
    industryTransferField: "industryCompanyApplication",
  },
  network: {
    timeoutMs: 12_000,
    maxHtmlBytes: 524_288,
    maxRedirects: 3,
  },
  render: {
    viewportWidth: 390,
    viewportHeight: 844,
    minimumInteractiveControls: 2,
    requireEditableControl: true,
    requirePublicLink: true,
  },
  caps: {
    deadOrBlockedFunctionality: 3,
    staticOrUninspectableFunctionality: 3,
    missingVerificationEvidence: 3,
    mockAmbiguityRelevance: 5,
    mockAmbiguityVerification: 5,
    copiedGoldenCraft: 6,
    copiedGoldenRelevance: 6,
    missingIndustryTransferRelevance: 6,
  },
  confidenceCaps: {
    deadClaimConflict: 0.6,
    sourceUnreachable: 0.69,
    uninspectable: 0.69,
  },
  flags: {
    possibleInjection: "possible-injection",
    linkDead: "link-dead",
    lowConfidence: "low-confidence",
    mockAmbiguity: "mock-ambiguity",
    privacySecurityHold: "privacy-security-hold",
    sourceUnreachable: "source-unreachable",
    v2Regression: "v2-regression",
    staticShell: "static-shell",
    appUninspectable: "app-uninspectable",
    acceptanceEvidenceMissing: "acceptance-evidence-missing",
    creatorPublicJourneyMissing: "creator-public-journey-missing",
    brandAffiliationReview: "brand-affiliation-review",
  },
} as const;

export type S4AppInspectionPolicy = typeof S4_APP_INSPECTION_POLICY_V1;
export type S4AcceptanceStatus = "PASS" | "FAIL" | "PARTIAL" | "NOT RUN";
export type S4AppInspectionState =
  | "inspectable"
  | "static"
  | "dead"
  | "blocked"
  | "unreachable"
  | "uninspectable";

export type S4SourceCheck = {
  /** Hash only: source URLs need not be copied into grading artifacts. */
  urlHash: string;
  ok: boolean;
  status: number;
};

export type S4RepositoryCheck = {
  /** Hash only: repository paths and owner names are not sent to the grader. */
  urlHash: string;
  ok: boolean;
  status: number;
  finalHost: string | null;
};

export type S4RenderedSensitiveCategory =
  | "secret-token"
  | "sensitive-key"
  | "email"
  | "phone"
  | "prompt-injection";

export type S4AppInspectionArtifact = {
  schemaVersion: 1;
  policyId: "s4-artifact-inspection-v1";
  policySha256: string;
  binding: {
    submissionId: string;
    assessmentVersionId: string;
    assessmentSha256: string;
    evaluatorSha256: string;
    submissionVersion: number;
    attempt: number;
  };
  sourceContext: {
    submissionId: string;
    assessmentVersionId: string;
    contentHash: string;
  } | null;
  previousArtifactSha256: string | null;
  inspectedAt: string;
  /** Query, fragment and credentials are removed; hash binds the exact input. */
  submittedUrl: string | null;
  submittedUrlSha256: string;
  finalUrl: string | null;
  finalUrlSha256: string | null;
  state: S4AppInspectionState;
  httpStatus: number;
  document: {
    contentType: string | null;
    byteCount: number;
    sha256: string;
  } | null;
  render: {
    domSha256: string;
    screenshotSha256: string;
    screenshotByteCount: number;
    bodyTextLength: number;
    interactiveControlCount: number;
    editableControlCount: number;
    publicLinkCount: number;
    mobileNoHorizontalScroll: boolean;
    renderedAnalyticsClaim: boolean;
    analyticsLabelledDemo: boolean;
    sensitiveFindingCount: number;
    sensitiveFindingCategories: S4RenderedSensitiveCategory[];
    sensitiveTextSha256: string | null;
  } | null;
  acceptance: {
    statuses: Record<string, S4AcceptanceStatus>;
    referencedIds: string[];
    corePassCount: number;
    publishAccessPassCount: number;
  };
  repositoryCheck: S4RepositoryCheck | null;
  sourceChecks: S4SourceCheck[];
  evidence: {
    cleanEvidenceCount: number;
    screenshotReceiptSha256: string | null;
  };
  artifactSha256: string;
};

export type S4DimensionCap = {
  dimension: "functionality" | "craft" | "relevance" | "verification-evidence";
  max: number;
};

export type S4AppGradingDecision = {
  policyId: "s4-artifact-inspection-v1";
  fixturePolicyId: "s4-gf-01-06-v1";
  fixtureIds: string[];
  caps: S4DimensionCap[];
  flags: string[];
  /** Every deterministic flag creates an instructor hold through the worker. */
  holds: string[];
  confidenceMax: number;
  stopAutomatedGrading: boolean;
  suppressGallery: boolean;
};

type GradeLike = {
  rubricScores: Record<string, { score: number; rationale: string }>;
  total?: number;
  confidence: number;
  flags: string[];
};

export function sha256Json(value: unknown): string {
  return sha256CanonicalJson(value);
}

/**
 * The first S4 release intentionally accepts one exact policy object. Rubric
 * caps cannot be widened by a mutable evaluator field while a submission is
 * queued; changing this object requires a new evaluator/assessment checksum.
 */
export function parseS4AppInspectionPolicy(value: unknown): S4AppInspectionPolicy | null {
  return canonicalJson(value) === canonicalJson(S4_APP_INSPECTION_POLICY_V1)
    ? S4_APP_INSPECTION_POLICY_V1
    : null;
}

export function parseS4AcceptanceStatuses(value: unknown): Record<string, S4AcceptanceStatus> {
  if (typeof value !== "string") return {};
  const statuses: Record<string, S4AcceptanceStatus> = {};
  const severity: Record<S4AcceptanceStatus, number> = {
    FAIL: 0,
    "NOT RUN": 1,
    PARTIAL: 2,
    PASS: 3,
  };
  const pattern = /\b(AT-(?:0[1-9]|1[0-8]))\s+(PASS|FAIL|PARTIAL|NOT\s+RUN)\b/gi;
  for (const match of value.matchAll(pattern)) {
    const id = match[1].toUpperCase();
    const status = match[2].toUpperCase().replace(/\s+/g, " ") as S4AcceptanceStatus;
    const previous = statuses[id];
    // Conflicting claims are order-independent and resolve to the least
    // favorable authored state: FAIL < NOT RUN < PARTIAL < PASS.
    if (!previous || severity[status] < severity[previous]) statuses[id] = status;
  }
  return statuses;
}

function addCap(caps: Map<S4DimensionCap["dimension"], number>, cap: S4DimensionCap): void {
  caps.set(cap.dimension, Math.min(caps.get(cap.dimension) ?? Number.POSITIVE_INFINITY, cap.max));
}

function textFields(fields: Record<string, unknown>): string {
  return Object.values(fields)
    .flatMap((value) =>
      typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === "string")
          : [],
    )
    .join("\n");
}

function hasPromptInjection(value: string): boolean {
  return (
    /ignore\s+(?:the|this|all|previous)?\s*(?:rubric|instructions?)/i.test(value) ||
    /award\s+(?:me\s+)?(?:a\s+)?(?:full\s+marks?|40\s*\/\s*40)/i.test(value) ||
    /instructor\s+(?:has\s+)?approved\s+(?:this|it)/i.test(value)
  );
}

function exactConfirmation(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "I CONFIRM";
}

function wordCount(value: unknown): number {
  return typeof value === "string" ? value.trim().split(/\s+/).filter(Boolean).length : 0;
}

function copiedGoldenPromptWithoutOwnedDecision(fields: Record<string, unknown>): boolean {
  const prompt = typeof fields.firstPrompt === "string" ? fields.firstPrompt : "";
  const goldenMarkers = [
    /original educational web app called [“\"]?signalshelf/i,
    /schemaVersion[^\n]{0,100}creator[^\n]{0,100}blocks[^\n]{0,100}theme/i,
    /demo analytics\s*[·.-]\s*this browser only/i,
    /AT-01 through AT-18/i,
  ];
  const copiedMarkerCount = goldenMarkers.filter((marker) => marker.test(prompt)).length;
  if (copiedMarkerCount < 3) return false;
  const owned = typeof fields.approvedPlanSummary === "string" ? fields.approvedPlanSummary : "";
  return (
    wordCount(owned) < 20 ||
    /\b(?:no changes?|used as[- ]is|copied (?:the )?(?:golden|instructor)|nothing changed)\b/i.test(
      owned,
    )
  );
}

export function buildS4AppGradingDecision(args: {
  artifact: S4AppInspectionArtifact;
  fields: Record<string, unknown>;
  unsafeEvidence: boolean;
  previousAcceptance: Record<string, S4AcceptanceStatus>;
}): S4AppGradingDecision {
  const policy = S4_APP_INSPECTION_POLICY_V1;
  const caps = new Map<S4DimensionCap["dimension"], number>();
  const flags = new Set<string>();
  const fixtureIds = new Set<string>();
  let confidenceMax = 1;
  let stopAutomatedGrading = false;
  let suppressGallery = false;
  const allText = textFields(args.fields);
  const submittedStatuses = {
    ...args.artifact.acceptance.statuses,
    ...parseS4AcceptanceStatuses(args.fields.acceptanceTestLog),
  };

  if (hasPromptInjection(allText)) {
    fixtureIds.add("S4-GF-01");
    flags.add(policy.flags.possibleInjection);
  }

  if (
    args.artifact.state === "dead" ||
    args.artifact.state === "blocked" ||
    args.artifact.state === "unreachable"
  ) {
    addCap(caps, {
      dimension: "functionality",
      max: policy.caps.deadOrBlockedFunctionality,
    });
    flags.add(policy.flags.linkDead);
    flags.add(policy.flags.lowConfidence);
    confidenceMax = Math.min(confidenceMax, policy.confidenceCaps.deadClaimConflict);
    if (Object.values(submittedStatuses).filter((status) => status === "PASS").length >= 15) {
      fixtureIds.add("S4-GF-02");
    }
  }

  if (args.artifact.state === "static" || args.artifact.state === "uninspectable") {
    addCap(caps, {
      dimension: "functionality",
      max: policy.caps.staticOrUninspectableFunctionality,
    });
    flags.add(
      args.artifact.state === "static"
        ? policy.flags.staticShell
        : policy.flags.appUninspectable,
    );
    flags.add(policy.flags.lowConfidence);
    confidenceMax = Math.min(confidenceMax, policy.confidenceCaps.uninspectable);
  }

  if (
    args.artifact.state === "inspectable" &&
    args.artifact.render &&
    (args.artifact.render.editableControlCount === 0 ||
      args.artifact.render.publicLinkCount === 0)
  ) {
    addCap(caps, {
      dimension: "functionality",
      max: policy.caps.staticOrUninspectableFunctionality,
    });
    flags.add(policy.flags.creatorPublicJourneyMissing);
  }

  if (
    args.artifact.acceptance.referencedIds.length === 0 ||
    args.artifact.evidence.cleanEvidenceCount === 0
  ) {
    addCap(caps, {
      dimension: "verification-evidence",
      max: policy.caps.missingVerificationEvidence,
    });
    flags.add(policy.flags.acceptanceEvidenceMissing);
  }

  if (
    args.artifact.binding.submissionVersion >= policy.repository.requiredFromVersion &&
    !args.artifact.repositoryCheck?.ok
  ) {
    addCap(caps, {
      dimension: "verification-evidence",
      max: policy.caps.missingVerificationEvidence,
    });
    flags.add(policy.flags.sourceUnreachable);
    flags.add(policy.flags.lowConfidence);
    confidenceMax = Math.min(confidenceMax, policy.confidenceCaps.sourceUnreachable);
  }

  if (
    args.artifact.render?.renderedAnalyticsClaim &&
    !args.artifact.render.analyticsLabelledDemo
  ) {
    fixtureIds.add("S4-GF-03");
    flags.add(policy.flags.mockAmbiguity);
    addCap(caps, { dimension: "relevance", max: policy.caps.mockAmbiguityRelevance });
    addCap(caps, {
      dimension: "verification-evidence",
      max: policy.caps.mockAmbiguityVerification,
    });
  }

  if (copiedGoldenPromptWithoutOwnedDecision(args.fields)) {
    addCap(caps, { dimension: "craft", max: policy.caps.copiedGoldenCraft });
    addCap(caps, { dimension: "relevance", max: policy.caps.copiedGoldenRelevance });
  }

  if (wordCount(args.fields.industryCompanyApplication) < 20) {
    addCap(caps, {
      dimension: "relevance",
      max: policy.caps.missingIndustryTransferRelevance,
    });
  }

  if (args.unsafeEvidence || (args.artifact.render?.sensitiveFindingCount ?? 0) > 0) {
    fixtureIds.add("S4-GF-04");
    flags.add(policy.flags.privacySecurityHold);
    stopAutomatedGrading = true;
    suppressGallery = true;
  }

  if (
    args.artifact.sourceChecks.length > 0 &&
    args.artifact.sourceChecks.every((check) => !check.ok)
  ) {
    fixtureIds.add("S4-GF-05");
    flags.add(policy.flags.sourceUnreachable);
    flags.add(policy.flags.lowConfidence);
    confidenceMax = Math.min(confidenceMax, policy.confidenceCaps.sourceUnreachable);
  }

  if (
    args.artifact.binding.submissionVersion >= 2 &&
    Object.entries(args.previousAcceptance).some(
      ([id, previous]) => previous === "PASS" && submittedStatuses[id] !== "PASS",
    )
  ) {
    fixtureIds.add("S4-GF-06");
    flags.add(policy.flags.v2Regression);
  }

  if (!exactConfirmation(args.fields.nonAffiliationConfirmation)) {
    flags.add(policy.flags.brandAffiliationReview);
  }

  const orderedFlags = [...flags].sort();
  return {
    policyId: policy.policyId,
    fixturePolicyId: policy.fixturePolicyId,
    fixtureIds: [...fixtureIds].sort(),
    caps: [...caps.entries()]
      .map(([dimension, max]) => ({ dimension, max }))
      .sort((left, right) => left.dimension.localeCompare(right.dimension)),
    flags: orderedFlags,
    holds: orderedFlags,
    confidenceMax,
    stopAutomatedGrading,
    suppressGallery,
  };
}

export function applyS4AppGradingDecision<T extends GradeLike>(
  grade: T,
  decision: S4AppGradingDecision,
): T {
  const rubricScores = Object.fromEntries(
    Object.entries(grade.rubricScores).map(([key, value]) => [key, { ...value }]),
  );
  for (const cap of decision.caps) {
    const dimension = rubricScores[cap.dimension];
    if (!dimension || dimension.score <= cap.max) continue;
    dimension.score = cap.max;
    dimension.rationale = `${dimension.rationale} [deterministic S4 policy cap: ${cap.max}]`;
  }
  const total = Object.values(rubricScores).reduce((sum, dimension) => sum + dimension.score, 0);
  return {
    ...grade,
    rubricScores,
    total,
    confidence: Math.min(grade.confidence, decision.confidenceMax),
    flags: [...new Set([...grade.flags, ...decision.flags])].sort(),
  };
}

export function s4InspectionEvidenceSummary(
  artifact: S4AppInspectionArtifact,
  decision: S4AppGradingDecision,
): { id: string; text: string } {
  const caps = decision.caps.length
    ? decision.caps.map((cap) => `${cap.dimension}<=${cap.max}`).join(", ")
    : "none";
  let finalHost = "none";
  try {
    finalHost = artifact.finalUrl ? new URL(artifact.finalUrl).hostname : "none";
  } catch {
    finalHost = "invalid";
  }
  return {
    id: `s4-app-inspection:${artifact.artifactSha256}`,
    text: [
      `Bound app inspection ${artifact.artifactSha256}.`,
      `State ${artifact.state}; HTTP ${artifact.httpStatus}; final host ${finalHost}.`,
      `Observed controls ${artifact.render?.interactiveControlCount ?? 0}, editable ${artifact.render?.editableControlCount ?? 0}, public links ${artifact.render?.publicLinkCount ?? 0}, mobile overflow ${artifact.render ? String(!artifact.render.mobileNoHorizontalScroll) : "unknown"}.`,
      `Acceptance IDs ${artifact.acceptance.referencedIds.length}; clean evidence ${artifact.evidence.cleanEvidenceCount}; repository ${artifact.repositoryCheck ? (artifact.repositoryCheck.ok ? "reachable" : "unreachable") : "not supplied"}; deterministic caps ${caps}.`,
    ].join(" "),
  };
}
