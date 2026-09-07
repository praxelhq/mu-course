// Recovery when an interview call drops. There is no transactional email in
// this system, and adding a provider for this volume is not worth the secret
// or the delivery log — so both sides are composed text: the student gets a
// prefilled mailto, and the instructor gets a draft to paste into a reply.
//
// Neither template may carry a score. Grades reach students only through
// instructor review, and a support mail is not that channel.

export const ESCALATION_MAILBOX = "build@praxel.in";

export type InterviewProgress = {
  interviewId: string;
  attemptNumber: number;
  /** Segment keys already covered, in the order they were asked. */
  segmentsCovered: string[];
  /** Student turns on record — how far they actually got. */
  studentTurns: number;
  startedAt: Date;
};

const SEGMENT_TITLES: Record<string, string> = {
  intro: "introduction",
  ai_in_their_work: "applying AI in their previous role",
  data_and_privacy: "what data they would give an AI",
  rag_mcp: "retrieval and connectors",
  own_work_defence: "defending their own workflow and sector map",
};

export function segmentTitle(key: string): string {
  return SEGMENT_TITLES[key] ?? key.replace(/_/g, " ");
}

function describeProgress(progress: InterviewProgress): string {
  if (progress.studentTurns === 0) {
    return "The call dropped before any answer was recorded.";
  }
  const covered = progress.segmentsCovered.length
    ? `Covered so far: ${progress.segmentsCovered.map(segmentTitle).join(", ")}.`
    : "No segment was completed.";
  return `${progress.studentTurns} answer${progress.studentTurns === 1 ? "" : "s"} recorded. ${covered}`;
}

/**
 * The student-facing escalation. Returned as parts so the page can render a
 * readable body AND build the mailto href from the same source.
 */
export function studentEscalationMail(progress: InterviewProgress): {
  to: string;
  subject: string;
  body: string;
  href: string;
} {
  const to = ESCALATION_MAILBOX;
  const subject = `Interview cut off — ${progress.interviewId}`;
  const body = [
    "Hello,",
    "",
    "My AI interview was cut off and I could not finish it.",
    "",
    `Interview reference: ${progress.interviewId}`,
    `Attempt: ${progress.attemptNumber}`,
    `Started: ${progress.startedAt.toISOString()}`,
    describeProgress(progress),
    "",
    "Could you please reopen it so I can complete the remaining questions?",
    "",
    "Thank you.",
  ].join("\n");
  const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { to, subject, body, href };
}

/**
 * The instructor's reply draft. Carries what was already covered so the
 * student is not asked to repeat it, plus the fresh link. No scores.
 */
export function instructorReplyDraft(args: {
  progress: InterviewProgress;
  studentName: string;
  interviewUrl: string;
}): string {
  const { progress, studentName, interviewUrl } = args;
  const remaining = Object.keys(SEGMENT_TITLES).filter(
    (key) => !progress.segmentsCovered.includes(key),
  );
  return [
    `Hi ${studentName},`,
    "",
    "Sorry about that — I have reopened your interview.",
    "",
    describeProgress(progress),
    remaining.length
      ? `Still to cover: ${remaining.map(segmentTitle).join(", ")}.`
      : "You had reached the end of the questions; the reopened session will be short.",
    "",
    `Start again here: ${interviewUrl}`,
    "",
    "You will not be marked down for the interruption.",
    "",
    "Thanks,",
  ].join("\n");
}

/**
 * Derive progress from the stored transcript. Segment keys are recorded on the
 * agent's turn meta by the turn-based loop; a realtime interview may have none,
 * in which case the turn count still tells the instructor how far it got.
 */
export function progressFromTurns(args: {
  interviewId: string;
  attemptNumber: number;
  createdAt: Date;
  turns: { speaker: string; meta: unknown }[];
}): InterviewProgress {
  const segmentsCovered: string[] = [];
  for (const turn of args.turns) {
    if (turn.speaker !== "agent") continue;
    const category =
      typeof turn.meta === "object" && turn.meta !== null && "category" in turn.meta
        ? (turn.meta as { category?: unknown }).category
        : undefined;
    if (typeof category === "string" && !segmentsCovered.includes(category)) {
      segmentsCovered.push(category);
    }
  }
  return {
    interviewId: args.interviewId,
    attemptNumber: args.attemptNumber,
    segmentsCovered,
    studentTurns: args.turns.filter((turn) => turn.speaker === "student").length,
    startedAt: args.createdAt,
  };
}
