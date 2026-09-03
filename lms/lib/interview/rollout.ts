import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

// Interview v2 ships deployed but closed. Students reach nothing until an
// instructor opens it, so a deploy is never the thing that starts a cohort's
// assessment.
//
// This is a ConfigKV row rather than a Gate: GateTarget has no interview
// member, the interview is scheduled by InterviewWindow, and adding an enum
// member would touch every gate-resolution path for one boolean. Same shape as
// the peer_checkpoint and reveal_votes flags.

export const INTERVIEW_ROLLOUT_KEY = "interview_v2";

export class InterviewClosedError extends Error {
  readonly status = 409;
  constructor() {
    super("Interviews are not open yet. Your instructor will let you know when they are.");
    this.name = "InterviewClosedError";
  }
}

/** Absent row means closed — a fresh deploy exposes nothing. */
export async function interviewOpen(client: PrismaClient = defaultPrisma): Promise<boolean> {
  const row = await client.configKV.findUnique({ where: { key: INTERVIEW_ROLLOUT_KEY } });
  const value = row?.value as { open?: unknown } | undefined;
  return value?.open === true;
}

export async function assertInterviewOpen(client: PrismaClient = defaultPrisma): Promise<void> {
  if (!(await interviewOpen(client))) throw new InterviewClosedError();
}

export async function setInterviewOpen(
  open: boolean,
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  await client.configKV.upsert({
    where: { key: INTERVIEW_ROLLOUT_KEY },
    create: { key: INTERVIEW_ROLLOUT_KEY, value: { open } },
    update: { value: { open } },
  });
}
