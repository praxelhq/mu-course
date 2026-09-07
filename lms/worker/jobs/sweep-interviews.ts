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

export interface SweepDeps {
  prisma?: PrismaClient;
  enqueue?: (interviewId: string) => Promise<string | null>;
  now?: () => Date;
}

export async function sweepInterviews(deps: SweepDeps = {}): Promise<{
  requeued: number;
  reaped: number;
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
    select: { id: true },
    take: 100,
  });
  for (const row of stale) {
    // Bound to `live` so a student who reconnects in the same moment wins.
    const updated = await db.interview.updateMany({
      where: { id: row.id, status: InterviewStatus.live },
      data: {
        status: InterviewStatus.escalated,
        escalationReason:
          "Abandoned mid-interview: no activity for 30 minutes. The student may need a retake.",
      },
    });
    if (updated.count > 0) {
      console.warn(`[interview-sweep] ${row.id} stale live — escalated for instructor review`);
    }
  }

  return { requeued: ungraded.length, reaped: stale.length };
}
