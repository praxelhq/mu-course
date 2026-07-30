import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getArtifactChecklist } from "@/lib/portfolio";
import { getBestOfThreeAvg } from "@/lib/quizzes";
import {
  aiInterview,
  artifactQuality,
  peerContribution,
  portfolio,
  quizzes as quizzesComponent,
  valueChainMap,
  workflowUsefulness,
  type PeerRatings,
  type SignOffStatus,
} from "./components";
import { finalGrade, type FinalGrade } from "./formula";
import { combinePci, pciForCheckpoint, type CombinedPci } from "./pci";
import type { ScoringPolicy } from "@/lib/assessment-policies";
import { parseScoringPolicy } from "@/lib/assessment-policies";
import {
  authoritativeWorkflowParts,
  workflowEvaluationForExactResult,
  type WorkflowFixtureEvaluation,
} from "@/lib/assessments/workflow-fixture-evaluation";

// DB assembly: gathers every component's source rows and feeds the pure
// scorers. "Latest" follows the review-queue candidate rule everywhere: the
// newest grade of the newest submission version per owner (user, or team for
// team-based types). Every line is labelled provisional until its sources are
// finalised; the grade line always renders all seven components.
//
// LEGACY BRIDGE (documented in docs/DECISIONS.md): unversioned workflow rows
// still derive §3 from the generic four dimensions. Versioned Session 5 rows
// use the exact bound WorkflowEvaluation receipt: fixture execution is local
// and authoritative, while usefulness/ownership are bounded to 30/10 from the
// final reviewed rubric on that exact selected/owned submission.
// Legacy parts are derived as:
//   usefulness (0–30)  = (craft + relevance) / 20 × 30
//   execution  (0–20)  = functionality / 10 × 20
//   ownership  (0–10)  = verification-evidence / 10 × 10
//
// U16 CONTRACT: PortfolioEntry.lastCrawl is expected as
//   { checkedAt: string(ISO), links: [{ url: string, ok: boolean, status?: number }] }
// and evidence integrity scores (ok links ÷ total links) × 15. Absent or
// malformed crawl data → the evidence part scores 0 with a "no crawl yet"
// detail — never a crash.

export type GradeLine = FinalGrade & {
  pci: CombinedPci & { cp1: number | null; cp2: number | null };
};

/** Slugs of individually-submitted artifact types feeding §2 (0–40 each). */
const INDIVIDUAL_ARTIFACT_SLUGS = ["skill", "data-memo", "app"] as const;

type LatestGrade = { total: number; provisional: boolean; rubricScores: Prisma.JsonValue };

/**
 * Latest grade of the latest submission version for one owner (user or team)
 * and one assignment-type slug — the shared candidate rule.
 */
async function latestGradeFor(
  owner: { userId: string } | { teamId: string },
  slug: string,
): Promise<LatestGrade | null> {
  const subs = await prisma.submission.findMany({
    where: {
      ...owner,
      assessmentVersionId: null,
      assignment: { assignmentType: { slug } },
      grades: { some: {} },
    },
    select: {
      grades: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { total: true, provisional: true, rubricScores: true },
      },
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    take: 1,
  });
  const grade = subs[0]?.grades[0];
  return grade ?? null;
}

type VersionedScoreCandidate = LatestGrade & {
  submissionId: string;
  assignmentId: string;
  version: number;
  attempt: number;
  status: string;
  policy: Exclude<ScoringPolicy, { component: "none" }>;
  workflowEvaluation: WorkflowFixtureEvaluation | null;
};

async function versionedScoreCandidates(args: {
  userId?: string;
  teamId?: string;
}): Promise<VersionedScoreCandidate[]> {
  if (!args.userId && !args.teamId) return [];
  const rows = await prisma.submission.findMany({
    where: {
      ...(args.userId ? { userId: args.userId } : { teamId: args.teamId! }),
      assessmentVersionId: { not: null },
      status: { in: ["graded", "finalised"] },
      assessmentResult: { scoreable: true },
      assessmentVersion: { purpose: "graded" },
      grades: { some: {} },
    },
    orderBy: [{ version: "desc" }, { attempt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      assignmentId: true,
      version: true,
      attempt: true,
      status: true,
      assessmentVersionId: true,
      ownerKind: true,
      ownerId: true,
      contentHash: true,
      assessmentVersion: { select: { scoringPolicy: true } },
      assessmentResult: {
        select: {
          submissionId: true,
          assessmentVersionId: true,
          ownerKind: true,
          ownerId: true,
          version: true,
          attempt: true,
          assessmentHash: true,
          evaluatorHash: true,
          structuredFeedback: true,
        },
      },
      grades: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { total: true, provisional: true, rubricScores: true },
      },
    },
  });
  const seenAssignments = new Set<string>();
  const out: VersionedScoreCandidate[] = [];
  for (const row of rows) {
    if (seenAssignments.has(row.assignmentId)) continue;
    // The newest scoreable row is authoritative for its assignment. If its
    // immutable policy is malformed, fail closed instead of silently reviving
    // an older result with a different policy.
    seenAssignments.add(row.assignmentId);
    const policy = parseScoringPolicy(row.assessmentVersion?.scoringPolicy);
    const grade = row.grades[0];
    if (!policy || policy.component === "none" || !grade) continue;
    out.push({
      submissionId: row.id,
      assignmentId: row.assignmentId,
      version: row.version,
      attempt: row.attempt,
      status: row.status,
      policy,
      workflowEvaluation: workflowEvaluationForExactResult(
        row.assessmentResult
          ? {
              ...row.assessmentResult,
              submission: {
                id: row.id,
                assessmentVersionId: row.assessmentVersionId,
                ownerKind: row.ownerKind,
                ownerId: row.ownerId,
                version: row.version,
                attempt: row.attempt,
                contentHash: row.contentHash,
              },
            }
          : null,
      ),
      ...grade,
    });
  }
  return out;
}

export function dimScore(rubricScores: Prisma.JsonValue, key: string): number {
  if (!rubricScores || typeof rubricScores !== "object" || Array.isArray(rubricScores)) return 0;
  const dim = (rubricScores as Record<string, unknown>)[key];
  if (dim && typeof dim === "object" && typeof (dim as { score?: unknown }).score === "number") {
    return (dim as { score: number }).score;
  }
  return 0;
}

type WorkflowScoringPolicy = Extract<ScoringPolicy, { component: "workflow" }>;

export function selectedWorkflowParts(args: {
  selected: { rubricScores: Prisma.JsonValue; policy: WorkflowScoringPolicy } | null;
  own: { rubricScores: Prisma.JsonValue; policy: WorkflowScoringPolicy } | null;
}): {
  usefulness0to30: number | null;
  execution0to20: number | null;
  ownership0to10: number | null;
} {
  const selected = args.selected;
  const own = args.own;
  const usefulness = selected
    ? selected.policy.dimensions.usefulness.reduce(
        (sum, key) => sum + dimScore(selected.rubricScores, key),
        0,
      ) / selected.policy.dimensions.usefulness.length
    : null;
  return {
    usefulness0to30: usefulness === null ? null : (usefulness / 10) * 30,
    execution0to20: selected
      ? (dimScore(selected.rubricScores, selected.policy.dimensions.execution) / 10) * 20
      : null,
    ownership0to10: own
      ? dimScore(own.rubricScores, own.policy.dimensions.ownership)
      : null,
  };
}

export function selectedVersionedWorkflowParts(args: {
  selected: {
    evaluation: WorkflowFixtureEvaluation;
  } | null;
  own: {
    evaluation: WorkflowFixtureEvaluation;
  } | null;
}): {
  usefulness0to30: number | null;
  execution0to20: number | null;
  ownership0to10: number | null;
} {
  return authoritativeWorkflowParts(args);
}

export function validateWorkflowSelectionTarget(args: {
  requestedTeamId: string;
  requestedAssignmentId: string;
  submission: {
    id: string;
    status: string;
    assignmentId: string;
    submitterTeamId: string | null;
    scoringPolicy: ScoringPolicy | null;
    purpose: "graded" | "formative";
    scoreable: boolean;
  };
}): { ok: true } | { ok: false; reason: string } {
  const { submission } = args;
  if (submission.status !== "finalised") {
    return { ok: false, reason: "submission-not-finalised" };
  }
  if (submission.assignmentId !== args.requestedAssignmentId) {
    return { ok: false, reason: "assignment-mismatch" };
  }
  if (submission.submitterTeamId !== args.requestedTeamId) {
    return { ok: false, reason: "team-mismatch" };
  }
  if (!submission.scoreable) {
    return { ok: false, reason: "submission-not-scoreable" };
  }
  if (submission.purpose !== "graded" || submission.scoringPolicy?.component !== "workflow") {
    return { ok: false, reason: "not-graded-workflow" };
  }
  return { ok: true };
}

function parseRatings(json: Prisma.JsonValue): PeerRatings | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>;
  if (
    typeof r.reliability === "number" &&
    typeof r.communication === "number" &&
    typeof r.helpfulness === "number"
  ) {
    return {
      reliability: r.reliability,
      communication: r.communication,
      helpfulness: r.helpfulness,
    };
  }
  return null;
}

/** Evidence integrity (0–15) from the U16 crawl JSON; null when no crawl. */
function evidenceIntegrityFromCrawl(lastCrawl: Prisma.JsonValue | null | undefined): number | null {
  if (!lastCrawl || typeof lastCrawl !== "object" || Array.isArray(lastCrawl)) return null;
  const links = (lastCrawl as { links?: unknown }).links;
  if (!Array.isArray(links) || links.length === 0) return null;
  const ok = links.filter(
    (l) => l && typeof l === "object" && (l as { ok?: unknown }).ok === true,
  ).length;
  return Math.round((ok / links.length) * 15 * 100) / 100;
}

/** Narrative heuristic (documented v1): substance approximated by length. */
function narrativeScore(narrative: string | null | undefined): number {
  const text = (narrative ?? "").trim();
  if (text.length === 0) return 0;
  if (text.length >= 200) return 25;
  if (text.length >= 80) return 15;
  return 8;
}

/** Validation counts from PortfolioEntry.validations; caps documented. */
function validationScores(validations: Prisma.JsonValue): { external: number; peer: number } {
  if (!Array.isArray(validations)) return { external: 0, peer: 0 };
  let external = 0;
  let peer = 0;
  for (const v of validations) {
    if (!v || typeof v !== "object") continue;
    const kind = (v as { kind?: unknown }).kind;
    if (kind === "external") external += 1;
    if (kind === "peer") peer += 1;
  }
  // 5 pts per external validation (cap 25), 3 pts per peer rating (cap 15).
  return { external: Math.min(25, external * 5), peer: Math.min(15, peer * 3) };
}

export function verifiedSignOffStatus(args: {
  signOff: {
    status: string;
    teamId: string;
    assignmentId: string | null;
    recordedBy: string;
    evidenceS3Key: string | null;
  } | null;
  selectedAssignmentId: string | null;
  recorderRole: string | null;
}): SignOffStatus {
  if (args.signOff?.status === "contacted") return "contacted";
  if (args.signOff?.status !== "signed_off") return "none";
  if (
    !args.signOff.evidenceS3Key?.startsWith(`signoffs/${args.signOff.teamId}/`) ||
    !args.signOff.recordedBy ||
    (args.recorderRole !== "instructor" && args.recorderRole !== "admin") ||
    !args.selectedAssignmentId ||
    args.signOff.assignmentId !== args.selectedAssignmentId
  ) {
    return "none";
  }
  return "signed_off";
}

/**
 * The full line-by-line grade for one student. userId must come from the
 * caller's OWN session on student surfaces (the /grades page passes
 * requireUser().userId and accepts no parameters).
 */
export async function getGradeLine(userId: string): Promise<GradeLine> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      teamId: true,
      team: { select: { id: true, members: { select: { id: true } } } },
    },
  });
  if (!user) throw new Error(`getGradeLine: unknown user ${userId}`);
  const teamId = user.teamId;
  const teamSize = user.team?.members.length ?? 0;

  const [individualVersioned, teamVersioned] = await Promise.all([
    versionedScoreCandidates({ userId }),
    teamId ? versionedScoreCandidates({ teamId }) : Promise.resolve([]),
  ]);

  const [
    vcmGrade,
    individualGrades,
    mediaGrade,
    workflowGrade,
    signOff,
    interview,
    reviewsReceived,
    bestOfThree,
    portfolioEntry,
    workflowSelection,
  ] = await Promise.all([
    teamId ? latestGradeFor({ teamId }, "value-chain-map") : null,
    Promise.all(INDIVIDUAL_ARTIFACT_SLUGS.map((slug) => latestGradeFor({ userId }, slug))),
    teamId ? latestGradeFor({ teamId }, "media") : null,
    teamId ? latestGradeFor({ teamId }, "workflow") : null,
    teamId ? prisma.signOff.findUnique({ where: { teamId } }) : null,
    prisma.interview.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, rubricScores: true },
    }),
    prisma.peerReview.findMany({
      where: { revieweeId: userId },
      select: { checkpoint: true, pointsAllocated: true, ratings: true },
    }),
    getBestOfThreeAvg(userId), // the ONLY quiz feed (R24)
    prisma.portfolioEntry.findUnique({ where: { userId } }),
    teamId
      ? prisma.teamWorkflowSelection.findFirst({
          where: { teamId },
          orderBy: { updatedAt: "desc" },
          select: {
            assignmentId: true,
            submission: {
              select: {
                id: true,
                status: true,
                assignmentId: true,
                teamId: true,
                assessmentVersionId: true,
                ownerKind: true,
                ownerId: true,
                version: true,
                attempt: true,
                contentHash: true,
                assessmentVersion: {
                  select: { id: true, purpose: true, scoringPolicy: true },
                },
                assessmentResult: {
                  select: {
                    scoreable: true,
                    submissionId: true,
                    assessmentVersionId: true,
                    ownerKind: true,
                    ownerId: true,
                    version: true,
                    attempt: true,
                    assessmentHash: true,
                    evaluatorHash: true,
                    structuredFeedback: true,
                  },
                },
                grades: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { rubricScores: true, provisional: true },
                },
              },
            },
          },
        })
      : null,
  ]);
  const signOffRecorderRole = signOff?.recordedBy
    ? (
        await prisma.user.findUnique({
          where: { id: signOff.recordedBy },
          select: { role: true },
        })
      )?.role ?? null
    : null;

  // --- PCI (§5) -------------------------------------------------------------
  const cpPci = (checkpoint: number): number | null => {
    const rows = reviewsReceived.filter((r) => r.checkpoint === checkpoint);
    if (rows.length === 0 || teamSize < 2) return null;
    const pointsReceived = rows.reduce((sum, r) => sum + r.pointsAllocated, 0);
    return pciForCheckpoint({ pointsReceived, teamSize });
  };
  const cp1 = cpPci(1);
  const cp2 = cpPci(2);
  const pci = combinePci({ cp1, cp2 });

  // --- §1 value chain map -----------------------------------------------------
  const versionedVcm = teamVersioned.find((candidate) => candidate.policy.component === "value-chain-map");
  const effectiveVcm = versionedVcm ?? vcmGrade;
  const vcm = valueChainMap({
    teamMapGrade100: effectiveVcm ? effectiveVcm.total * 2.5 : null, // 0–40 → 0–100
    pci: pci.pci,
  });

  // --- §2 artifact quality ----------------------------------------------------
  const gradedIndividuals = [
    ...individualGrades.filter((g): g is LatestGrade => g !== null),
    ...individualVersioned.filter(
      (candidate) =>
        candidate.policy.component === "artifact-quality" ||
        candidate.policy.component === "workflow",
    ),
  ];
  const versionedMedia = teamVersioned.find((candidate) => candidate.policy.component === "media");
  const effectiveMedia = versionedMedia ?? mediaGrade;
  const artifact = artifactQuality({
    individualArtifactGrades: gradedIndividuals.map((g) => g.total),
    teamMediaGrade0to40: effectiveMedia ? effectiveMedia.total : null,
  });

  // --- §3 workflow (exact versioned receipt; explicit legacy bridge) -----------
  const signOffStatus = verifiedSignOffStatus({
    signOff,
    selectedAssignmentId: workflowSelection?.assignmentId ?? null,
    recorderRole: signOffRecorderRole,
  });
  const selectedSubmission = workflowSelection?.submission;
  const selectedPolicy = parseScoringPolicy(selectedSubmission?.assessmentVersion?.scoringPolicy);
  const selectedValidation =
    teamId && selectedSubmission && selectedPolicy
      ? validateWorkflowSelectionTarget({
          requestedTeamId: teamId,
          requestedAssignmentId: workflowSelection.assignmentId,
          submission: {
            id: selectedSubmission.id,
            status: selectedSubmission.status,
            assignmentId: selectedSubmission.assignmentId,
            submitterTeamId: selectedSubmission.teamId,
            scoringPolicy: selectedPolicy,
            purpose: selectedSubmission.assessmentVersion?.purpose ?? "formative",
            scoreable: selectedSubmission.assessmentResult?.scoreable === true,
          },
        })
      : { ok: false as const, reason: "no-selection" };
  const selectedGrade = selectedSubmission?.grades[0];
  const selectedEvaluation = workflowEvaluationForExactResult(
    selectedSubmission?.assessmentResult
      ? {
          ...selectedSubmission.assessmentResult,
          submission: {
            id: selectedSubmission.id,
            assessmentVersionId: selectedSubmission.assessmentVersionId,
            ownerKind: selectedSubmission.ownerKind,
            ownerId: selectedSubmission.ownerId,
            version: selectedSubmission.version,
            attempt: selectedSubmission.attempt,
            contentHash: selectedSubmission.contentHash,
          },
        }
      : null,
  );
  const selectedWorkflow =
    selectedValidation.ok &&
    selectedPolicy?.component === "workflow" &&
    selectedGrade &&
    selectedEvaluation
      ? { evaluation: selectedEvaluation }
      : null;
  const ownWorkflowCandidate =
    workflowSelection
      ? individualVersioned.find(
          (candidate) =>
            candidate.assignmentId === workflowSelection.assignmentId &&
            candidate.status === "finalised" &&
            candidate.policy.component === "workflow",
        )
      : null;
  const policyWorkflowParts = selectedVersionedWorkflowParts({
    selected: selectedWorkflow,
    own:
      ownWorkflowCandidate?.policy.component === "workflow" &&
      ownWorkflowCandidate.workflowEvaluation
        ? {
            evaluation: ownWorkflowCandidate.workflowEvaluation,
          }
        : null,
  });
  const hasPolicyWorkflow = selectedWorkflow !== null;
  // Once the learner/team has entered the immutable-policy workflow path, an
  // absent or invalid instructor selection stays pending. The legacy slug
  // bridge must not resurrect an unrelated historical workflow grade.
  const useLegacyWorkflowBridge =
    !individualVersioned.some((candidate) => candidate.policy.component === "workflow") &&
    !teamVersioned.some((candidate) => candidate.policy.component === "workflow") &&
    !selectedSubmission?.assessmentVersion;
  const workflow = workflowUsefulness({
    signOffStatus,
    usefulness0to30: hasPolicyWorkflow
      ? policyWorkflowParts.usefulness0to30
      : useLegacyWorkflowBridge && workflowGrade
      ? ((dimScore(workflowGrade.rubricScores, "craft") +
          dimScore(workflowGrade.rubricScores, "relevance")) /
          20) *
        30
      : null,
    execution0to20: hasPolicyWorkflow
      ? policyWorkflowParts.execution0to20
      : useLegacyWorkflowBridge && workflowGrade
      ? (dimScore(workflowGrade.rubricScores, "functionality") / 10) * 20
      : null,
    ownership0to10: hasPolicyWorkflow
      ? policyWorkflowParts.ownership0to10
      : useLegacyWorkflowBridge && workflowGrade
      ? (dimScore(workflowGrade.rubricScores, "verification-evidence") / 10) * 10
      : null,
    pci: pci.pci,
  });

  // --- §4 AI interview (graded only; escalated stays pending until resolved) ---
  const interviewScores =
    interview?.status === "graded" &&
    interview.rubricScores &&
    typeof interview.rubricScores === "object" &&
    !Array.isArray(interview.rubricScores)
      ? (interview.rubricScores as Record<string, number>)
      : null;
  const interviewComponent = aiInterview({ rubricScores: interviewScores });
  if (interview?.status === "escalated") {
    interviewComponent.detail = "Interview under instructor review (escalated).";
  }

  // --- §5 peer contribution (standalone) ---------------------------------------
  const peer = peerContribution({
    ratings: reviewsReceived
      .map((r) => parseRatings(r.ratings))
      .filter((r): r is PeerRatings => r !== null),
  });

  // --- §6 quizzes ---------------------------------------------------------------
  const quizzes = quizzesComponent({ bestOfThreeAvg: bestOfThree });

  // --- §7 portfolio ---------------------------------------------------------------
  const completenessChecks = await getArtifactChecklist(userId);
  const presentCount = completenessChecks.filter((row) => row.present).length;
  const validation = validationScores(portfolioEntry?.validations ?? null);
  const evidenceIntegrity = evidenceIntegrityFromCrawl(portfolioEntry?.lastCrawl);
  const portfolioComponent = portfolio({
    completeness0to20:
      completenessChecks.length === 0
        ? 0
        : Math.round((presentCount / completenessChecks.length) * 20 * 100) / 100,
    narrative0to25: narrativeScore(portfolioEntry?.narrative),
    external0to25: validation.external,
    peer0to15: validation.peer,
    evidenceIntegrity0to15: evidenceIntegrity,
  });

  // --- assemble -------------------------------------------------------------------
  const anyArtifactProvisional =
    gradedIndividuals.some((g) => g.provisional) || (effectiveMedia?.provisional ?? false);

  const result = finalGrade({
    vcm: {
      ...vcm,
      pciApplied: vcm.raw === null ? null : pci.pci,
      provisional: effectiveVcm?.provisional ?? false,
    },
    artifact: { ...artifact, provisional: anyArtifactProvisional },
    workflow: {
      ...workflow,
      pciApplied: workflow.raw === null ? null : pci.pci,
      provisional: hasPolicyWorkflow
        ? Boolean(selectedGrade?.provisional || ownWorkflowCandidate?.provisional)
        : useLegacyWorkflowBridge
          ? (workflowGrade?.provisional ?? false)
          : false,
    },
    interview: { ...interviewComponent, provisional: false },
    // Peer + portfolio stay provisional until checkpoints close / U16 crawls.
    peer: { ...peer, provisional: peer.raw !== null },
    quizzes: { ...quizzes, provisional: false },
    portfolio: { ...portfolioComponent, provisional: true },
  });

  return { ...result, pci: { ...pci, cp1, cp2 } };
}
