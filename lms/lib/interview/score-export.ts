import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { numberField, toCsv } from "@/lib/csv-export";
import {
  INTERVIEW_CATEGORIES,
  LEGACY_INTERVIEW_CATEGORIES,
} from "@/lib/scoring/components";

// One builder behind both interview exports: the instructor download and the
// token-authenticated feed a spreadsheet refreshes itself from. They must not
// drift — a score that reads one way in a download and another in the sheet is
// worse than either on its own.

/**
 * Both rubric shapes get a column. The export spans the whole cohort's history,
 * so dropping the legacy columns would blank the scores of every interview
 * graded before v2.
 */
const EXPORT_SCORE_KEYS = [...INTERVIEW_CATEGORIES, ...LEGACY_INTERVIEW_CATEGORIES];

const IST_OFFSET_MS = 5.5 * 60 * 60_000;

/** IST, because that is the clock every reader of this sheet is on. */
function ist(date: Date | null): string {
  if (!date) return "";
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

export async function buildInterviewScoreCsv(
  client: PrismaClient = defaultPrisma,
): Promise<string> {
  const interviews = await client.interview.findMany({
    select: {
      id: true,
      status: true,
      attemptNumber: true,
      confidence: true,
      escalationReason: true,
      rubricScores: true,
      createdAt: true,
      completedAt: true,
      costUsd: true,
      videoS3Key: true,
      _count: { select: { turns: true } },
      user: {
        select: {
          name: true,
          email: true,
          section: { select: { code: true } },
          team: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return toCsv(
    [
      "interview_id",
      "name",
      "email",
      "section",
      "team",
      "status",
      "attempt",
      ...EXPORT_SCORE_KEYS,
      "total",
      "confidence",
      "flags",
      "duration_min",
      "turns",
      "recording",
      "started_ist",
      "completed_ist",
      "escalation_reason",
      "cost_usd",
    ],
    interviews.map((iv) => {
      const flags = (iv.rubricScores as { flags?: unknown } | null)?.flags;
      const durationMin =
        iv.completedAt
          ? Math.round((iv.completedAt.getTime() - iv.createdAt.getTime()) / 60_000)
          : "";
      return [
        iv.id,
        iv.user.name,
        iv.user.email,
        iv.user.section?.code ?? "",
        iv.user.team?.name ?? "",
        iv.status,
        iv.attemptNumber,
        ...EXPORT_SCORE_KEYS.map((k) => numberField(iv.rubricScores, k)),
        numberField(iv.rubricScores, "total"),
        iv.confidence ?? "",
        Array.isArray(flags) ? flags.join(" | ") : "",
        durationMin,
        // turn 0 is the system prompt, never part of the conversation.
        Math.max(0, iv._count.turns - 1),
        iv.videoS3Key ? "yes" : "no",
        ist(iv.createdAt),
        ist(iv.completedAt),
        iv.escalationReason ?? "",
        iv.costUsd.toFixed(4),
      ];
    }),
  );
}
