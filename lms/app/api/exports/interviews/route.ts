import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { csvResponse, numberField, toCsv } from "@/lib/csv-export";
import { INTERVIEW_CATEGORIES } from "@/lib/scoring/components";

// Instructor CSV export of interview status + rubric scores. One row
// per interview attempt (latest first per student), escalation reason
// included so the review queue can be worked from a spreadsheet.

export const dynamic = "force-dynamic";

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
        ...INTERVIEW_CATEGORIES,
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
        ...INTERVIEW_CATEGORIES.map((k) => numberField(iv.rubricScores, k)),
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
