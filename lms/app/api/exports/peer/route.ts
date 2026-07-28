import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv-export";

// U15 — instructor CSV export of the raw peer-review data: one row per
// (checkpoint, reviewer, reviewee) with the allocation and the three 1–5
// ratings. Grades/PCI never leave the LMS; this export is instructor-only.

export const dynamic = "force-dynamic";

function rating(json: unknown, key: string): number | "" {
  if (!json || typeof json !== "object" || Array.isArray(json)) return "";
  const v = (json as Record<string, unknown>)[key];
  return typeof v === "number" ? v : "";
}

export const GET = withAuth(
  async () => {
    const reviews = await prisma.peerReview.findMany({
      select: {
        checkpoint: true,
        pointsAllocated: true,
        ratings: true,
        reviewer: {
          select: { name: true, email: true, team: { select: { name: true } }, section: { select: { code: true } } },
        },
        reviewee: { select: { name: true, email: true } },
      },
      orderBy: [{ checkpoint: "asc" }, { reviewerId: "asc" }, { revieweeId: "asc" }],
    });

    const csv = toCsv(
      [
        "checkpoint",
        "section",
        "team",
        "reviewer_name",
        "reviewer_email",
        "reviewee_name",
        "reviewee_email",
        "points_allocated",
        "reliability",
        "communication",
        "helpfulness",
      ],
      reviews.map((r) => [
        r.checkpoint,
        r.reviewer.section?.code ?? "",
        r.reviewer.team?.name ?? "",
        r.reviewer.name,
        r.reviewer.email,
        r.reviewee.name,
        r.reviewee.email,
        r.pointsAllocated,
        rating(r.ratings, "reliability"),
        rating(r.ratings, "communication"),
        rating(r.ratings, "helpfulness"),
      ]),
    );
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="peer_reviews.csv"',
      },
    });
  },
  { role: "instructor" },
);
