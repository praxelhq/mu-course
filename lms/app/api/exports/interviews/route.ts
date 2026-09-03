import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { csvResponse, numberField, toCsv } from "@/lib/csv-export";
import {
  INTERVIEW_CATEGORIES,
  LEGACY_INTERVIEW_CATEGORIES,
} from "@/lib/scoring/components";

// Instructor CSV export of interview status + rubric scores. One row
// per interview attempt (latest first per student), escalation reason
// included so the review queue can be worked from a spreadsheet.

export const dynamic = "force-dynamic";

// Both rubric shapes get a column. The export spans the whole cohort's
// history, so dropping the legacy columns would blank the scores of every
// interview graded before v2.
const EXPORT_SCORE_KEYS = [...INTERVIEW_CATEGORIES, ...LEGACY_INTERVIEW_CATEGORIES];

export const GET = withAuth(
  async () => {
    const interviews = await prisma.interview.findMany({
      select: {
        id: true,
        status: true,
        attemptNumber: true,
        confidence: true,
        escalationReason: true,
        rubricScores: true,
        completedAt: true,
        user: {
          select: { name: true, email: true, section: { select: { code: true } }, team: { select: { name: true } } },
        },
      },
      orderBy: [{ userId: "asc" }, { createdAt: "desc" }],
    });

    const csv = toCsv(
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
        "escalation_reason",
        "completed_at",
      ],
      interviews.map((iv) => [
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
        iv.escalationReason ?? "",
        iv.completedAt?.toISOString() ?? "",
      ]),
    );
    return csvResponse(csv, "interviews.csv");
  },
  { role: "instructor" },
);
