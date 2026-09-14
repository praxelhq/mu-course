import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CHECKPOINT_ORDER } from "@/lib/shipyard/constants";
import { recomputeGates } from "@/lib/shipyard/gate-state";

// POST /api/shipyard/instructor/open-gate   (instructor or admin)
//   body { userId, checkpointKey, reason } → 200 { states }
//   400 invalid body, or a reason too thin to reconstruct later
//   404 that student has no product, or no such checkpoint
//
// The escape hatch from SPEC §4: "a manual 'open this checkpoint for this
// student' exists for genuine edge cases, audit-logged."
//
// It does NOT write a state. It stamps `manuallyOpenedBy` on the student's
// ShipyardCheckpointState and then asks `recomputeGates` for the answer, so
// the rule stays in `resolveGates` and the mark is an INPUT to it rather than
// an override of it (docs/DECISIONS.md, 2026-09-15). The practical difference:
// a manually-opened checkpoint that the student then clears behaves exactly
// like any other cleared checkpoint, and the one after it opens on its own.
//
// The reason is required and lands in AuditLog.after.reason. Six weeks later
// "why is this student two checkpoints ahead" has to have an answer.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    userId: z.string().min(1),
    checkpointKey: z.enum(CHECKPOINT_ORDER),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Name the student, the checkpoint, and a reason of at least eight characters." },
        { status: 400 },
      );
    }
    const { userId, checkpointKey, reason } = parsed.data;

    const product = await prisma.shipyardProduct.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!product) {
      return Response.json({ error: "That student has no product yet." }, { status: 404 });
    }

    const checkpoint = await prisma.shipyardCheckpoint.findFirst({
      where: { key: checkpointKey },
      select: { id: true, order: true, title: true },
    });
    if (!checkpoint) return Response.json({ error: "No such checkpoint." }, { status: 404 });

    const before = await prisma.shipyardCheckpointState.findUnique({
      where: { productId_checkpointId: { productId: product.id, checkpointId: checkpoint.id } },
      select: { state: true, manuallyOpenedBy: true, openedAt: true },
    });

    await prisma.shipyardCheckpointState.upsert({
      where: { productId_checkpointId: { productId: product.id, checkpointId: checkpoint.id } },
      create: {
        productId: product.id,
        checkpointId: checkpoint.id,
        state: "open",
        openedAt: new Date(),
        manuallyOpenedBy: user.userId,
      },
      update: { manuallyOpenedBy: user.userId },
    });

    const states = await recomputeGates(product.id);
    const after = states.find((s) => s.checkpointId === checkpoint.id) ?? null;

    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: "shipyard.gate.manual-open",
        targetType: "ShipyardCheckpointState",
        targetId: `${product.id}:${checkpoint.id}`,
        before: {
          state: before?.state ?? null,
          manuallyOpenedBy: before?.manuallyOpenedBy ?? null,
        } as unknown as Prisma.InputJsonValue,
        after: {
          userId,
          checkpointKey,
          checkpointOrder: checkpoint.order,
          state: after?.state ?? null,
          manuallyOpenedBy: user.userId,
          reason,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return Response.json({
      states: states.map((s) => ({
        key: s.key,
        order: s.order,
        state: s.state,
        reason: s.reason,
        manuallyOpenedBy: s.manuallyOpenedBy,
      })),
    });
  },
  { role: "instructor" },
);
