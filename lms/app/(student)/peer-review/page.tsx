import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";
import { PeerReviewForm, type TeammateRow } from "./peer-review-form";

// U15 — the peer checkpoint survey (§5): privately allocate 100 points across
// your teammates (never yourself) and rate each on reliability /
// communication / helpfulness (1–5). Resubmission overwrites while the
// checkpoint is active.

export const dynamic = "force-dynamic";

function activeCheckpointFrom(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const active = (value as { active?: unknown }).active;
  return active === 1 || active === 2 ? active : null;
}

export default async function PeerReviewPage() {
  let userId: string;
  let teamId: string | null;
  try {
    const user = await requireUser();
    if (user.role !== "student") redirect("/instructor/peer");
    userId = user.userId;
    teamId = user.teamId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const config = await prisma.configKV.findUnique({ where: { key: "peer_checkpoint" } });
  const checkpoint = activeCheckpointFrom(config?.value);

  const team = teamId
    ? await prisma.team.findUnique({
        where: { id: teamId },
        select: {
          name: true,
          members: { select: { id: true, name: true }, orderBy: { id: "asc" } },
        },
      })
    : null;

  const existing =
    checkpoint !== null
      ? await prisma.peerReview.findMany({
          where: { checkpoint, reviewerId: userId },
          select: { revieweeId: true, pointsAllocated: true, ratings: true },
        })
      : [];

  const teammates: TeammateRow[] = (team?.members ?? [])
    .filter((m) => m.id !== userId)
    .map((m) => {
      const row = existing.find((e) => e.revieweeId === m.id);
      const ratings =
        row?.ratings && typeof row.ratings === "object" && !Array.isArray(row.ratings)
          ? (row.ratings as { reliability?: number; communication?: number; helpfulness?: number })
          : {};
      return {
        id: m.id,
        name: m.name,
        points: row?.pointsAllocated ?? null,
        reliability: ratings.reliability ?? null,
        communication: ratings.communication ?? null,
        helpfulness: ratings.helpfulness ?? null,
      };
    });

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Peer review</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>
        {checkpoint !== null ? `Checkpoint ${checkpoint}` : "Peer review"}
      </h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Allocate exactly 100 points across your teammates for their contribution to the
        team&apos;s shared work — never yourself — and rate each on reliability,
        communication and helpfulness. Your answers are private: teammates never see
        them, only the resulting index reaches your instructors.
      </p>

      {checkpoint === null ? (
        <Card>
          <p style={{ margin: 0, color: "var(--charcoal)" }}>
            No peer-review checkpoint is open right now. Checkpoint 1 follows Session 6;
            checkpoint 2 follows Session 10.
          </p>
        </Card>
      ) : teammates.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--charcoal)" }}>
            You are not on a team yet, so there is nobody to review.
          </p>
        </Card>
      ) : (
        <PeerReviewForm
          teamName={team?.name ?? ""}
          checkpoint={checkpoint}
          teammates={teammates}
          alreadySubmitted={existing.length > 0}
        />
      )}
    </main>
  );
}
