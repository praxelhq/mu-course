import type { PrismaClient } from "@prisma/client";
import { InterviewStatus, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { enqueueGradeInterview } from "@/lib/queue";

// Repairs interviews that fall through the cracks. Every mode below has bitten
// a real student, and each one is SILENT: the interview simply never reaches a
// grade and nobody is told.
//
//   1. Completed but never graded. The enqueue at completion is best-effort and
//      its result is discarded, so a queue outage loses the job outright; a
//      retry of agent-complete hits the idempotent early return and never
//      re-enqueues. Grading also dead-letters after four attempts, and unlike
//      submissions there is no reconciler, no admin view and no redrive for
//      interviews — the row just sits there.
//
//   2. Stuck live. If the agent dies before completing and the student closes
//      the tab, nothing ever moves the row. Grading only looks at `completed`,
//      so it is invisible to everything. This is what six manual resets were.
//
// Both repairs are idempotent and safe to run every minute.

/** Grace before a completed-but-ungraded interview is re-enqueued. */
export const REGRADE_AFTER_MS = 10 * 60 * 1000;
/** Silence after which a live interview is presumed abandoned. */
export const STALE_LIVE_AFTER_MS = 30 * 60 * 1000;
/**
 * At or below this many interviewer turns, an abandoned interview is the
 * platform's fault, not the student's.
 *
 * A greeting plus at most one question means the student never got an
 * interview to walk out of. Every one of the four students lost to the dialog
 * outage sits here (0, 1, 2 and 2 agent turns), and each needed a retake
 * granted by hand — which is the thing this exists to stop. Above the
 * threshold, a silent room is a judgement call and stays with the instructor.
 */
export const PLATFORM_FAILURE_MAX_AGENT_TURNS = 2;

export const ABANDONED_REASON =
  "Abandoned mid-interview: no activity for 30 minutes. The student may need a retake.";
export const PLATFORM_FAILURE_REASON =
  "Interview ended before it began: the interviewer stopped within the first two turns. " +
  "This is a platform failure, not the student's — a retake has been granted automatically.";

export interface SweepDeps {
  prisma?: PrismaClient;
  enqueue?: (interviewId: string) => Promise<string | null>;
  now?: () => Date;
}

/**
 * Grant one retake unless the student already holds an unused one. Returns
 * whether a grant was created, and never throws into the sweep: failing to
 * hand back an attempt must not stop the rest of the repairs from running.
 *
 * The read-then-create below is check-then-act, so two concurrent sweeps could
 * both see "none" and both insert, handing a student two extra attempts at a
 * graded assessment. The partial unique index
 * `InterviewRetake_one_unused_per_user` makes that impossible; the loser of the
 * race lands in the catch and reports no grant, which is the truth.
 */
async function grantRetakeIfNone(
  db: PrismaClient,
  userId: string,
  interviewId: string,
): Promise<boolean> {
  try {
    const existing = await db.interviewRetake.findFirst({
      where: { userId, usedByInterviewId: null },
      select: { id: true },
    });
    if (existing) return false;
    const grant = await db.interviewRetake.create({
      data: { userId, grantedBy: SWEEP_ACTOR },
    });
    await db.auditLog.create({
      data: {
        actorId: null,
        action: "interview.grant-retake",
        targetType: "user",
        targetId: userId,
        after: { grantedBy: SWEEP_ACTOR, grantId: grant.id, interviewId, reason: "platform-failure" },
      },
    });
    console.warn(
      `[interview-sweep] ${interviewId} was a platform failure — granted ${userId} a retake`,
    );
    return true;
  } catch (err) {
    console.error(`[interview-sweep] could not auto-grant a retake for ${userId}:`, err);
    return false;
  }
}

/** Actor recorded on sweep-granted retakes, so they are distinguishable. */
export const SWEEP_ACTOR = "system:interview-sweep";

export async function sweepInterviews(deps: SweepDeps = {}): Promise<{
  requeued: number;
  reaped: number;
  autoRetakes: number;
}> {
  const db = deps.prisma ?? defaultPrisma;
  const enqueue = deps.enqueue ?? enqueueGradeInterview;
  const now = (deps.now ?? (() => new Date()))();

  // 1. Completed, past the grace period, still no grade.
  const ungraded = await db.interview.findMany({
    where: {
      status: InterviewStatus.completed,
      rubricScores: { equals: Prisma.DbNull },
      completedAt: { lt: new Date(now.getTime() - REGRADE_AFTER_MS) },
    },
    select: { id: true },
    take: 100,
  });
  for (const row of ungraded) {
    const jobId = await enqueue(row.id);
    console.warn(
      `[interview-sweep] ${row.id} completed but ungraded — re-enqueued (${jobId ?? "queue unavailable"})`,
    );
  }

  // 2. Live and silent. Escalated rather than completed: an abandoned room is
  // not a finished interview, and grading a fragment would be worse than
  // putting it in front of the instructor who can grant a retake.
  const staleBefore = new Date(now.getTime() - STALE_LIVE_AFTER_MS);
  const stale = await db.interview.findMany({
    where: {
      status: InterviewStatus.live,
      OR: [{ lastSeenAt: { lt: staleBefore } }, { lastSeenAt: null, createdAt: { lt: staleBefore } }],
    },
    select: { id: true, userId: true, turns: { select: { speaker: true } } },
    take: 100,
  });
  let autoRetakes = 0;
  for (const row of stale) {
    const agentTurns = row.turns.filter((t) => t.speaker === "agent").length;
    const studentTurns = row.turns.filter((t) => t.speaker === "student").length;
    // Zero answers is the other unambiguous shape of "not the student's fault",
    // and it is NOT covered by the agent-turn threshold: a student who dropped
    // during startup leaves the interviewer questioning an empty room for the
    // full budget, which can be fifteen agent turns with nobody there. The
    // agent refuses to complete that transcript, so it lands here — and without
    // this it would have looked like a long, deliberate walk-out.
    const platformFailure =
      agentTurns <= PLATFORM_FAILURE_MAX_AGENT_TURNS || studentTurns === 0;

    // Bound to `live` so a student who reconnects in the same moment wins.
    const updated = await db.interview.updateMany({
      where: { id: row.id, status: InterviewStatus.live },
      data: {
        status: InterviewStatus.escalated,
        escalationReason: platformFailure ? PLATFORM_FAILURE_REASON : ABANDONED_REASON,
      },
    });
    if (updated.count === 0) continue;

    if (!platformFailure) {
      console.warn(`[interview-sweep] ${row.id} stale live — escalated for instructor review`);
      continue;
    }

    // Give the attempt back without waiting for someone to notice. The grant is
    // what startInterview consumes; without one the student is simply locked
    // out, and the only reason five students were locked out for two days is
    // that this ran by hand.
    if (await grantRetakeIfNone(db, row.userId, row.id)) autoRetakes += 1;
  }

  return { requeued: ungraded.length, reaped: stale.length, autoRetakes };
}
