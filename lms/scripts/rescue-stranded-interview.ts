// Close a stranded interview and grant its student a retake, now, instead of
// waiting up to 30 minutes for the abandonment sweep to notice.
//
//   pnpm interview:rescue --interview <id>            # report only
//   pnpm interview:rescue --interview <id> --write
//
// Applies exactly the sweep's platform-failure path (worker/jobs/sweep-
// interviews): a student whose interviewer left within the first couple of
// turns never got an interview to walk out of, so the attempt is not theirs to
// lose. Refuses above that threshold — a silent room later on is a judgement
// call and stays with the instructor.
import { InterviewStatus, PrismaClient } from "@prisma/client";
import {
  PLATFORM_FAILURE_MAX_AGENT_TURNS,
  PLATFORM_FAILURE_REASON,
} from "../worker/jobs/sweep-interviews";

const prisma = new PrismaClient();
const ACTOR = "system:manual-rescue";

async function main(): Promise<void> {
  const i = process.argv.indexOf("--interview");
  const interviewId = i === -1 ? undefined : process.argv[i + 1];
  if (!interviewId) throw new Error("--interview <id> is required");
  const write = process.argv.includes("--write");

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      turns: { where: { turnNo: { gt: 0 } }, select: { speaker: true } },
    },
  });
  if (!interview) throw new Error(`Unknown interview ${interviewId}`);

  const agentTurns = interview.turns.filter((t) => t.speaker === "agent").length;
  const studentTurns = interview.turns.filter((t) => t.speaker === "student").length;
  console.log(
    `${interview.user.name} <${interview.user.email}>\n` +
      `  status ${interview.status} · attempt ${interview.attemptNumber} · ` +
      `${agentTurns} interviewer turn(s), ${studentTurns} student turn(s)`,
  );

  if (agentTurns > PLATFORM_FAILURE_MAX_AGENT_TURNS) {
    throw new Error(
      `${agentTurns} interviewer turns is above the platform-failure threshold ` +
        `(${PLATFORM_FAILURE_MAX_AGENT_TURNS}). This one is a judgement call — resolve it in /instructor/interviews.`,
    );
  }

  const existing = await prisma.interviewRetake.findFirst({
    where: { userId: interview.user.id, usedByInterviewId: null },
    select: { id: true },
  });
  console.log(
    `  ${existing ? "already holds an unused retake — will only close the interview" : "no unused retake — will grant one"}`,
  );
  if (!write) {
    console.log("\nDry run. Re-run with --write to apply.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (interview.status === InterviewStatus.live) {
      await tx.interview.update({
        where: { id: interview.id },
        data: {
          status: InterviewStatus.escalated,
          escalationReason: PLATFORM_FAILURE_REASON,
          completedAt: new Date(),
        },
      });
    }
    if (!existing) {
      const grant = await tx.interviewRetake.create({
        data: { userId: interview.user.id, grantedBy: ACTOR },
      });
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "interview.grant-retake",
          targetType: "user",
          targetId: interview.user.id,
          after: {
            grantedBy: ACTOR,
            grantId: grant.id,
            interviewId: interview.id,
            reason: "platform-failure",
          },
        },
      });
    }
  });
  console.log("\nDone — the student can start a fresh interview now.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
