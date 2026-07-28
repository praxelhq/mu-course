// U15 — the seven component scorers, pure functions. NO DB imports: data in,
// {raw, detail} out. raw is 0–100 or null (null = pending: the source doesn't
// exist yet). The frozen methodology (docs/build/01_scoring_methodology.md
// §§1–7) wins any conflict; judgment calls are documented inline.

export type ComponentScore = {
  /** 0–100, or null when the component's source data doesn't exist yet. */
  raw: number | null;
  /** Human-readable working — surfaces in the student grade line. */
  detail: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// §1 Value chain map (team score × PCI)
// ---------------------------------------------------------------------------

/**
 * Team map score × the individual's PCI. The methodology multiplies then
 * weights, so a PCI above 1 can push past 100 — DECISION: the component is
 * clipped to 100 AFTER the multiply (a component must stay on the 0–100 scale
 * §8 requires before weighting).
 */
export function valueChainMap(input: {
  teamMapGrade100: number | null;
  pci: number;
}): ComponentScore {
  if (input.teamMapGrade100 === null) {
    return { raw: null, detail: "No graded team value chain map yet." };
  }
  const product = input.teamMapGrade100 * input.pci;
  const raw = Math.min(100, product);
  return {
    raw: round2(raw),
    detail:
      `Team map ${round2(input.teamMapGrade100)} × PCI ${round2(input.pci)}` +
      (product > 100 ? ` = ${round2(product)}, clipped to 100.` : `.`),
  };
}

// ---------------------------------------------------------------------------
// §2 Artifact quality (individual mean, team media applied equally)
// ---------------------------------------------------------------------------

/**
 * Mean of the individually-submitted artifact grades (each 0–40, scaled ×2.5
 * to 0–100). The team media grade "applies to every team member equally" (§2)
 * — it enters the same mean as one more artifact.
 */
export function artifactQuality(input: {
  /** Grades of individually-submitted artifacts (skill, data memo, app), each 0–40. */
  individualArtifactGrades: number[];
  /** The team's media grade (0–40), when graded. */
  teamMediaGrade0to40?: number | null;
}): ComponentScore {
  const entries = input.individualArtifactGrades.map((g) => g * 2.5);
  const media = input.teamMediaGrade0to40;
  if (media !== null && media !== undefined) entries.push(media * 2.5);
  if (entries.length === 0) return { raw: null, detail: "No graded artifacts yet." };
  const mean = entries.reduce((a, b) => a + b, 0) / entries.length;
  return {
    raw: round2(mean),
    detail:
      `Mean of ${entries.length} graded artifact${entries.length === 1 ? "" : "s"} ` +
      `(each 0–40 scaled to 0–100)` +
      (media !== null && media !== undefined ? `, incl. the team media grade.` : `.`),
  };
}

// ---------------------------------------------------------------------------
// §3 Workflow relevance and usefulness
// ---------------------------------------------------------------------------

export type SignOffStatus = "none" | "contacted" | "signed_off";

export const SIGN_OFF_POINTS: Record<SignOffStatus, number> = {
  none: 0,
  contacted: 15,
  signed_off: 40,
};

/**
 * Reading of §3 taken here (documented DECISION): the team portion (sign-off
 * 0/15/40 + usefulness 0–30 + execution 0–20, max 90) is multiplied by the
 * PCI; the individual-ownership sub-score (0–10) is "applied to that specific
 * student only" and therefore added OUTSIDE the multiplier. Clipped to 100
 * after (PCI 1.2 on a strong team could otherwise exceed it).
 * Null usefulness/execution (no graded workflow submission yet) → pending.
 */
export function workflowUsefulness(input: {
  signOffStatus: SignOffStatus;
  usefulness0to30: number | null;
  execution0to20: number | null;
  ownership0to10: number | null;
  pci: number;
}): ComponentScore {
  if (input.usefulness0to30 === null || input.execution0to20 === null) {
    return { raw: null, detail: "No graded workflow submission yet." };
  }
  const signOffPts = SIGN_OFF_POINTS[input.signOffStatus];
  const team = signOffPts + input.usefulness0to30 + input.execution0to20;
  const ownership = input.ownership0to10 ?? 0;
  const product = team * input.pci + ownership;
  return {
    raw: round2(Math.min(100, product)),
    detail:
      `(Sign-off ${signOffPts} + usefulness ${round2(input.usefulness0to30)} + ` +
      `execution ${round2(input.execution0to20)}) × PCI ${round2(input.pci)} + ` +
      `ownership ${round2(ownership)} (individual, outside the PCI)` +
      (product > 100 ? `, clipped to 100.` : `.`),
  };
}

// ---------------------------------------------------------------------------
// §4 AI interview
// ---------------------------------------------------------------------------

export const INTERVIEW_CATEGORIES = [
  "industry_command",
  "defence_of_submissions",
  "operators_loop",
  "transfer",
] as const;

/** Sum of the four 25-point categories. Null (not graded yet) → pending. */
export function aiInterview(input: {
  rubricScores: Partial<Record<(typeof INTERVIEW_CATEGORIES)[number], number>> | null;
}): ComponentScore {
  if (!input.rubricScores) {
    return { raw: null, detail: "Interview not graded yet." };
  }
  const sum = INTERVIEW_CATEGORIES.reduce(
    (acc, key) => acc + (input.rubricScores?.[key] ?? 0),
    0,
  );
  return { raw: round2(Math.min(100, sum)), detail: "Four interview categories, 25 points each." };
}

// ---------------------------------------------------------------------------
// §5 Peer contribution (the standalone 10%)
// ---------------------------------------------------------------------------

export type PeerRatings = { reliability: number; communication: number; helpfulness: number };

/**
 * Mean of ALL 1–5 ratings across raters and checkpoints. §5 states the line
 * item as a 0–10 score weighted 10%; DECISION: like every other component it
 * is normalized to 0–100 BEFORE the weight (mean × 20), which is arithmetic-
 * identical to (mean × 2) / 10 × 100.
 */
export function peerContribution(input: { ratings: PeerRatings[] }): ComponentScore {
  const values = input.ratings.flatMap((r) => [r.reliability, r.communication, r.helpfulness]);
  if (values.length === 0) return { raw: null, detail: "No peer ratings yet." };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    raw: round2(mean * 20),
    detail: `Mean of ${values.length} peer ratings (1–5 scale) × 20.`,
  };
}

// ---------------------------------------------------------------------------
// §6 Quizzes (best-of-three — the ONLY feed is lib/quizzes getBestOfThreeAvg)
// ---------------------------------------------------------------------------

/** Passthrough of the best-of-three average; null when no counting attempts. */
export function quizzes(input: { bestOfThreeAvg: number | null }): ComponentScore {
  if (input.bestOfThreeAvg === null) {
    return { raw: null, detail: "No counting quiz attempts yet." };
  }
  return { raw: round2(input.bestOfThreeAvg), detail: "Best-of-three surprise-quiz average." };
}

// ---------------------------------------------------------------------------
// §7 Portfolio (20 + 25 + 25 + 15 + 15)
// ---------------------------------------------------------------------------

/**
 * Sum of the five portfolio parts. Evidence integrity comes from U16's
 * automated crawl; a missing crawl scores 0 with a "no crawl yet" detail —
 * null-safe, never a crash.
 */
export function portfolio(input: {
  completeness0to20: number;
  narrative0to25: number;
  external0to25: number;
  peer0to15: number;
  evidenceIntegrity0to15: number | null;
}): ComponentScore {
  const evidence = input.evidenceIntegrity0to15 ?? 0;
  const sum =
    input.completeness0to20 + input.narrative0to25 + input.external0to25 + input.peer0to15 + evidence;
  return {
    raw: round2(Math.min(100, sum)),
    detail:
      `Completeness ${round2(input.completeness0to20)}/20 · narrative ${round2(input.narrative0to25)}/25 · ` +
      `external ${round2(input.external0to25)}/25 · peer ${round2(input.peer0to15)}/15 · evidence ` +
      (input.evidenceIntegrity0to15 === null
        ? `0/15 (no crawl yet).`
        : `${round2(evidence)}/15.`),
  };
}
