import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// U15 — peer checkpoint submission. The active checkpoint comes from ConfigKV
// "peer_checkpoint" {active: 1|2|null}; while a checkpoint is active a student
// may resubmit freely (idempotent upsert on the (checkpoint, reviewer,
// reviewee) unique key — overwrite-while-active, frozen once closed).
// Validation (all 422): points must be integers ≥ 0 summing to EXACTLY 100,
// never self, every teammate covered exactly once, ratings 1–5.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  allocations: z
    .array(
      z.object({
        revieweeId: z.string().min(1),
        points: z.number().int().min(0).max(100),
        ratings: z.object({
          reliability: z.number().int().min(1).max(5),
          communication: z.number().int().min(1).max(5),
          helpfulness: z.number().int().min(1).max(5),
        }),
      }),
    )
    .min(1)
    .max(20),
});

function activeCheckpointFrom(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const active = (value as { active?: unknown }).active;
  return active === 1 || active === 2 ? active : null;
}

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid body" }, { status: 422 });
  }
  const { allocations } = parsed.data;

  const config = await prisma.configKV.findUnique({ where: { key: "peer_checkpoint" } });
  const checkpoint = activeCheckpointFrom(config?.value);
  if (checkpoint === null) {
    return Response.json({ error: "No peer-review checkpoint is open right now" }, { status: 409 });
  }

  if (!user.teamId) {
    return Response.json({ error: "You are not on a team" }, { status: 422 });
  }
  const team = await prisma.team.findUnique({
    where: { id: user.teamId },
    select: { members: { select: { id: true } } },
  });
  const teammateIds = new Set(
    (team?.members ?? []).map((m) => m.id).filter((id) => id !== user.userId),
  );

  if (allocations.some((a) => a.revieweeId === user.userId)) {
    return Response.json({ error: "You cannot allocate points to yourself" }, { status: 422 });
  }
  const seen = new Set<string>();
  for (const a of allocations) {
    if (!teammateIds.has(a.revieweeId)) {
      return Response.json({ error: `Not a teammate: ${a.revieweeId}` }, { status: 422 });
    }
    if (seen.has(a.revieweeId)) {
      return Response.json({ error: "Duplicate teammate in allocation" }, { status: 422 });
    }
    seen.add(a.revieweeId);
  }
  if (seen.size !== teammateIds.size) {
    return Response.json(
      { error: "Every teammate must receive an allocation (0 is allowed)" },
      { status: 422 },
    );
  }
  const total = allocations.reduce((sum, a) => sum + a.points, 0);
  if (total !== 100) {
    return Response.json(
      { error: `Points must sum to exactly 100 (got ${total})` },
      { status: 422 },
    );
  }

  await prisma.$transaction(
    allocations.map((a) =>
      prisma.peerReview.upsert({
        where: {
          checkpoint_reviewerId_revieweeId: {
            checkpoint,
            reviewerId: user.userId,
            revieweeId: a.revieweeId,
          },
        },
        update: {
          pointsAllocated: a.points,
          ratings: a.ratings as Prisma.InputJsonValue,
        },
        create: {
          checkpoint,
          reviewerId: user.userId,
          revieweeId: a.revieweeId,
          pointsAllocated: a.points,
          ratings: a.ratings as Prisma.InputJsonValue,
        },
      }),
    ),
  );

  return Response.json({ ok: true, checkpoint, saved: allocations.length });
});
