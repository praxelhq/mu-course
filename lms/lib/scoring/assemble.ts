import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
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

// U15 — DB assembly: gathers every component's source rows and feeds the pure
// scorers. "Latest" follows the review-queue candidate rule everywhere: the
// newest grade of the newest submission version per owner (user, or team for
// team-based types). Every line is labelled provisional until its sources are
// finalised; the grade line always renders all seven components.
//
// v1 BRIDGE (documented in docs/DECISIONS.md): the seeded workflow rubric uses
// the generic four dimensions (functionality / craft / relevance /
// verification-evidence, 0–10 each), not §3's parts. Until a workflow-specific
// rubric is configured, the parts are derived as:
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

/** Types a "complete" portfolio must show a graded submission for (§7). */
const REQUIRED_PORTFOLIO_SLUGS = [
  "skill",
  "data-memo",
  "app",
  "workflow",
  "media",
  "value-chain-map",
] as const;

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

function dimScore(rubricScores: Prisma.JsonValue, key: string): number {
  if (!rubricScores || typeof rubricScores !== "object" || Array.isArray(rubricScores)) return 0;
  const dim = (rubricScores as Record<string, unknown>)[key];
  if (dim && typeof dim === "object" && typeof (dim as { score?: unknown }).score === "number") {
    return (dim as { score: number }).score;
  }
  return 0;
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
  ]);

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
  const vcm = valueChainMap({
    teamMapGrade100: vcmGrade ? vcmGrade.total * 2.5 : null, // 0–40 → 0–100
    pci: pci.pci,
  });

  // --- §2 artifact quality ----------------------------------------------------
  const gradedIndividuals = individualGrades.filter((g): g is LatestGrade => g !== null);
  const artifact = artifactQuality({
    individualArtifactGrades: gradedIndividuals.map((g) => g.total),
    teamMediaGrade0to40: mediaGrade ? mediaGrade.total : null,
  });

  // --- §3 workflow (v1 rubric bridge, see module header) -----------------------
  const signOffStatus = ((signOff?.status as SignOffStatus | undefined) ?? "none") satisfies SignOffStatus;
  const workflow = workflowUsefulness({
    signOffStatus,
    usefulness0to30: workflowGrade
      ? ((dimScore(workflowGrade.rubricScores, "craft") +
          dimScore(workflowGrade.rubricScores, "relevance")) /
          20) *
        30
      : null,
    execution0to20: workflowGrade
      ? (dimScore(workflowGrade.rubricScores, "functionality") / 10) * 20
      : null,
    ownership0to10: workflowGrade
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
  const completenessChecks = await Promise.all(
    REQUIRED_PORTFOLIO_SLUGS.map(async (slug) => {
      const teamBased = slug === "workflow" || slug === "media" || slug === "value-chain-map";
      if (teamBased && !teamId) return false;
      const count = await prisma.submission.count({
        where: {
          ...(teamBased ? { teamId: teamId! } : { userId }),
          assignment: { assignmentType: { slug } },
          status: { in: ["graded", "finalised"] },
        },
      });
      return count > 0;
    }),
  );
  const presentCount = completenessChecks.filter(Boolean).length;
  const validation = validationScores(portfolioEntry?.validations ?? null);
  const evidenceIntegrity = evidenceIntegrityFromCrawl(portfolioEntry?.lastCrawl);
  const portfolioComponent = portfolio({
    completeness0to20:
      Math.round((presentCount / REQUIRED_PORTFOLIO_SLUGS.length) * 20 * 100) / 100,
    narrative0to25: narrativeScore(portfolioEntry?.narrative),
    external0to25: validation.external,
    peer0to15: validation.peer,
    evidenceIntegrity0to15: evidenceIntegrity,
  });

  // --- assemble -------------------------------------------------------------------
  const anyArtifactProvisional =
    gradedIndividuals.some((g) => g.provisional) || (mediaGrade?.provisional ?? false);

  const result = finalGrade({
    vcm: {
      ...vcm,
      pciApplied: vcm.raw === null ? null : pci.pci,
      provisional: vcmGrade?.provisional ?? false,
    },
    artifact: { ...artifact, provisional: anyArtifactProvisional },
    workflow: {
      ...workflow,
      pciApplied: workflow.raw === null ? null : pci.pci,
      provisional: workflowGrade?.provisional ?? false,
    },
    interview: { ...interviewComponent, provisional: false },
    // Peer + portfolio stay provisional until checkpoints close / U16 crawls.
    peer: { ...peer, provisional: peer.raw !== null },
    quizzes: { ...quizzes, provisional: false },
    portfolio: { ...portfolioComponent, provisional: true },
  });

  return { ...result, pci: { ...pci, cp1, cp2 } };
}
