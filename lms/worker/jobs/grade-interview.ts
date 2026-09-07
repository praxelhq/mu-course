import { InterviewStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { structuredCall, gradingModel, type StructuredCaller } from "@/lib/ai/client";
import {
  assembleInterviewGradingContext,
  interviewEscalationReason,
  interviewGradeSchema,
  type InterviewGradeResponse,
  type SubmissionSummary,
} from "@/lib/ai/interview-grading";
import { estimateCostUsd } from "./grade-submission";

// The grade.interview consumer. Same failure policy as grade.submission
// (docs/DECISIONS.md): model double-failure throws → pg-boss retries with
// backoff → dead-letters to grade.interview.dead; the interview stays
// 'completed' so a re-enqueue re-runs cleanly.
//
// Escalation (docs/build/01_scoring_methodology §4 — REQUIRED, not optional):
// low confidence or integrity flags → status 'escalated' + escalationReason;
// the instructor resolves it from /instructor/interviews. The student
// notification NEVER carries scores.

export interface GradeInterviewDeps {
  prisma?: PrismaClient;
  model?: StructuredCaller;
}

export async function handleGradeInterview(
  interviewId: string,
  deps: GradeInterviewDeps = {},
): Promise<void> {
  const db = deps.prisma ?? defaultPrisma;

  const interview = await db.interview.findUnique({
    where: { id: interviewId },
    include: {
      turns: { orderBy: { turnNo: "asc" } },
      user: { select: { id: true, team: { select: { sectorName: true } } } },
    },
  });
  if (!interview) {
    console.warn(`[interview-grading] ${interviewId} not found — skipping`);
    return;
  }
  if (interview.status !== InterviewStatus.completed) {
    console.warn(
      `[interview-grading] ${interviewId} is '${interview.status}' — skipping (only completed interviews are graded)`,
    );
    return;
  }

  const transcript = interview.turns
    .filter((t) => t.turnNo > 0)
    .map((t) => ({ turnNo: t.turnNo, speaker: t.speaker, text: t.text, startedAt: t.startedAt }));

  // The student's submitted work — the consistency check's ground truth.
  const submissionRows = await db.submission.findMany({
    where: { userId: interview.userId },
    include: {
      assignment: { select: { title: true, assignmentType: { select: { slug: true } } } },
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  const seen = new Set<string>();
  const submissions: SubmissionSummary[] = [];
  for (const sub of submissionRows) {
    if (seen.has(sub.assignmentId)) continue;
    seen.add(sub.assignmentId);
    const fields = (sub.fields ?? {}) as Record<string, unknown>;
    submissions.push({
      title: sub.assignment.title,
      typeSlug: sub.assignment.assignmentType.slug,
      fieldsExcerpt: Object.entries(fields)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v ?? "")}`)
        .join("\n")
        .slice(0, 1500),
    });
  }

  const context = assembleInterviewGradingContext({
    transcript,
    submissions,
    sectorName: interview.user.team?.sectorName ?? null,
  });

  // Model call (throws → retry → dead letter).
  const call = deps.model ?? (structuredCall as StructuredCaller);
  const result = await call<InterviewGradeResponse>({
    system: context.system,
    user: context.user,
    schema: interviewGradeSchema(),
    maxTokens: 2048,
    temperature: 0,
  });

  const grade = result.data;
  const escalationReason = interviewEscalationReason(grade);
  const model = result.model || gradingModel();
  const costUsd = estimateCostUsd(model, result.usage);

  await db.$transaction(async (tx) => {
    await tx.interview.update({
      where: { id: interview.id },
      data: {
        status: escalationReason ? InterviewStatus.escalated : InterviewStatus.graded,
        escalationReason,
        confidence: grade.confidence,
        rubricScores: {
          ...Object.fromEntries(
            Object.entries(grade.rubricScores).map(([k, v]) => [k, v.score]),
          ),
          total: grade.total,
          rationales: Object.fromEntries(
            Object.entries(grade.rubricScores).map(([k, v]) => [k, v.rationale]),
          ),
          flags: grade.flags,
        } as unknown as Prisma.InputJsonValue,
        costUsd: { increment: costUsd },
      },
    });
    await tx.notification.create({
      data: {
        userId: interview.userId,
        kind: "interview-recorded",
        title: "Interview recorded",
        // Deliberately score-free: results reach students only after
        // instructor review (grades never leave the LMS).
        body: "Thanks for completing your AI interview. Your responses are recorded — results will be shared after instructor review.",
      },
    });
    await tx.costLog.create({
      data: {
        feature: "interview",
        provider: "anthropic",
        model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsd,
        refType: "interview",
        refId: interview.id,
      },
    });
  });
}
