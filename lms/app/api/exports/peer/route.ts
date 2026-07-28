import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { csvResponse, numberField, toCsv } from "@/lib/csv-export";

// Instructor CSV export of the raw peer-review data: one row per
// (checkpoint, reviewer, reviewee) with the allocation and the three 1–5
// ratings. Grades/PCI never leave the LMS; this export is instructor-only.

export const dynamic = "force-dynamic";

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
        numberField(r.ratings, "reliability"),
        numberField(r.ratings, "communication"),
        numberField(r.ratings, "helpfulness"),
      ]),
    );
    return csvResponse(csv, "peer_reviews.csv");
  },
  { role: "instructor" },
);
