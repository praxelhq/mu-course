// Re-mark already-graded interviews against the CURRENT grader.
//
//   pnpm interview:remark              # dry run — show every delta, write nothing
//   pnpm interview:remark --write      # apply
//   pnpm interview:remark --limit 5    # try a handful first
//
// Why this exists: when the rubric changes, the cohort splits into students
// marked under the old bar and students marked under the new one. That is not
// a defensible way to score an assessment, and the fix is to put every
// transcript back through the same marker.
//
// A RE-MARK NEVER LOWERS A SCORE. Students have already been told where they
// stand; a change we made for our own reasons must not take marks off them. If
// the new mark is lower, the old one stands and the row is left untouched.
// Legacy four-axis interviews are skipped entirely — they keep their scores
// forever (docs/DECISIONS.md).
//
// Notifications are deliberately NOT sent: students were notified when the
// interview was first recorded, and a second "interview recorded" would be
// confusing. Costs are logged as feature 'interview_remark'.
import { InterviewStatus, Prisma, PrismaClient } from "@prisma/client";
import { gradingModel, structuredCall } from "../lib/ai/client";
import {
  assembleInterviewGradingContext,
  interviewEscalationReason,
  interviewGradeSchema,
  type InterviewGradeResponse,
  type SubmissionSummary,
} from "../lib/ai/interview-grading";
import { estimateCostUsd } from "../worker/jobs/grade-submission";

const prisma = new PrismaClient();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

type Scores = { conceptual: number; integrity: number; total: number };

function readScores(raw: unknown): Scores | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const conceptual = Number(row.conceptual_understanding);
  const integrity = Number(row.work_integrity);
  if (!Number.isFinite(conceptual) || !Number.isFinite(integrity)) return null;
  return { conceptual, integrity, total: conceptual + integrity };
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const limit = Number(flag("limit") ?? 0) || undefined;

  const interviews = await prisma.interview.findMany({
    where: { completedAt: { not: null }, rubricScores: { not: Prisma.DbNull } },
    include: {
      turns: { orderBy: { turnNo: "asc" } },
      user: { select: { id: true, name: true, team: { select: { sectorName: true } } } },
    },
    orderBy: { completedAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  let raised = 0;
  let held = 0;
  let skipped = 0;
  let spend = 0;
  let totalDelta = 0;

  for (const interview of interviews) {
    const before = readScores(interview.rubricScores);
    if (!before) {
      skipped += 1; // legacy four-axis rubric, or nothing scored
      continue;
    }

    const transcript = interview.turns
      .filter((t) => t.turnNo > 0)
      .map((t) => ({ turnNo: t.turnNo, speaker: t.speaker, text: t.text, startedAt: t.startedAt }));
    if (transcript.length === 0) {
      skipped += 1;
      continue;
    }

    const submissionRows = await prisma.submission.findMany({
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

    let result;
    try {
      result = await structuredCall<InterviewGradeResponse>({
        system: context.system,
        user: context.user,
        schema: interviewGradeSchema(),
        maxTokens: 2048,
        temperature: 0,
      });
    } catch (err) {
      console.log(`ERR  ${interview.user.name} → ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const grade = result.data;
    const after = {
      conceptual: grade.rubricScores.conceptual_understanding!.score,
      integrity: grade.rubricScores.work_integrity!.score,
      total: grade.total,
    };
    const model = result.model || gradingModel();
    const costUsd = estimateCostUsd(model, result.usage);
    spend += costUsd;

    const delta = after.total - before.total;
    const label = `${interview.user.name.padEnd(28).slice(0, 28)} ${String(before.total).padStart(3)} → ${String(after.total).padStart(3)}`;

    if (delta <= 0) {
      held += 1;
      console.log(`HOLD ${label}  (${delta === 0 ? "unchanged" : `would drop ${-delta}`}, old mark stands)`);
      continue;
    }

    raised += 1;
    totalDelta += delta;
    console.log(`UP   ${label}  (+${delta})`);
    if (!write) continue;

    const escalationReason = interviewEscalationReason(grade);
    await prisma.$transaction(async (tx) => {
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
            remarkedAt: new Date().toISOString(),
            previousTotal: before.total,
          } as unknown as Prisma.InputJsonValue,
          costUsd: { increment: costUsd },
        },
      });
      await tx.costLog.create({
        data: {
          feature: "interview_remark",
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

  console.log(
    `\n${write ? "applied" : "DRY RUN"} · ${raised} raised (+${totalDelta} marks total)` +
      ` · ${held} held · ${skipped} skipped · $${spend.toFixed(4)}`,
  );
  if (!write) console.log("Re-run with --write to apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
