import { INTERVIEW_CATEGORIES, INTERVIEW_CATEGORY_MAX, LEGACY_INTERVIEW_CATEGORIES } from "@/lib/ai/interview-grading";

// What a STUDENT is allowed to see about their own interview.
//
// The grade row carries more than the student may read: `confidence`,
// `escalationReason`, the integrity flags the grader inferred, and the
// platform's own `systemFlags`. Telling a student they were flagged for
// possible coaching hands a cheater the feedback loop they need and turns
// every borderline case into a dispute. So this module builds the view from
// an explicit allow-list of fields rather than deleting the sensitive ones —
// a new column on Interview is invisible here until someone adds it on purpose.

export const LEGACY_INTERVIEW_CATEGORY_MAX = 25;

export type InterviewAxisView = {
  key: string;
  label: string;
  score: number;
  max: number;
  rationale: string;
};

export type InterviewResultView =
  | { state: "none" }
  | { state: "live" }
  | { state: "grading" }
  | {
      state: "ready";
      axes: InterviewAxisView[];
      total: number;
      max: number;
      completedAt: string | null;
    };

const AXIS_LABELS: Record<string, string> = {
  conceptual_understanding: "Conceptual understanding",
  work_integrity: "Work integrity",
  industry_command: "Industry command",
  defence_of_submissions: "Defence of submissions",
  operators_loop: "Operator's loop",
  transfer: "Transfer",
};

function labelFor(key: string): string {
  return AXIS_LABELS[key] ?? key.replace(/_/g, " ");
}

/** One axis as stored by the grader: {score, rationale}. */
type StoredAxis = { score?: unknown; rationale?: unknown };

/**
 * Build the student's view. `escalated` is deliberately treated exactly like
 * `graded`: an escalated interview still shows its score, because branching the
 * UI on escalation would tell the student they had been flagged.
 */
export function buildInterviewResult(
  interview: {
    status: string;
    rubricScores: unknown;
    completedAt: Date | null;
  } | null,
): InterviewResultView {
  if (!interview) return { state: "none" };
  if (interview.status === "pending") return { state: "none" };
  if (interview.status === "live") return { state: "live" };

  const raw = interview.rubricScores;
  if (!raw || typeof raw !== "object") return { state: "grading" };
  const scores = raw as Record<string, StoredAxis | number | undefined>;

  const usesCurrent = INTERVIEW_CATEGORIES.some((key) => scores[key] !== undefined);
  const keys = usesCurrent ? INTERVIEW_CATEGORIES : LEGACY_INTERVIEW_CATEGORIES;
  const max = usesCurrent ? INTERVIEW_CATEGORY_MAX : LEGACY_INTERVIEW_CATEGORY_MAX;

  const axes: InterviewAxisView[] = [];
  for (const key of keys) {
    const entry = scores[key];
    if (entry === undefined || entry === null) continue;
    // Historical rows stored a bare number; current rows store {score, rationale}.
    const score = typeof entry === "number" ? entry : Number((entry as StoredAxis).score);
    if (!Number.isFinite(score)) continue;
    const rationale =
      typeof entry === "object" && typeof (entry as StoredAxis).rationale === "string"
        ? ((entry as StoredAxis).rationale as string)
        : "";
    axes.push({ key, label: labelFor(key), score, max, rationale });
  }

  if (axes.length === 0) return { state: "grading" };

  return {
    state: "ready",
    axes,
    total: axes.reduce((sum, axis) => sum + axis.score, 0),
    max: max * keys.length,
    completedAt: interview.completedAt ? interview.completedAt.toISOString() : null,
  };
}

/** Plain-text transcript of the result, for the download button. */
export function formatInterviewResultText(
  view: Extract<InterviewResultView, { state: "ready" }>,
  studentName: string,
): string {
  const lines = [
    "PRAXEL — AI READINESS INTERVIEW",
    "",
    `Student: ${studentName}`,
    view.completedAt ? `Completed: ${new Date(view.completedAt).toUTCString()}` : "",
    "",
    `RESULT: ${view.total} / ${view.max}`,
    "",
  ];
  for (const axis of view.axes) {
    lines.push(`${axis.label}: ${axis.score} / ${axis.max}`);
    if (axis.rationale) lines.push(`  ${axis.rationale}`);
    lines.push("");
  }
  lines.push("Grades are finalised after instructor review.");
  return lines.filter((line) => line !== undefined).join("\n");
}
