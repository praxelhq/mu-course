import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTrackerMode } from "@/lib/tracker/client";
import { FakeTrackerDisabledError, setFakeSignals } from "@/lib/tracker/fake";
import { recomputeGates } from "@/lib/shipyard/gate-state";

// POST /api/shipyard/admin/fake-tracker  (admin only)
//   body { userId, signals: Partial<TrackerSignals> } → 200 { signals, states }
//   403 not an admin
//   404 that student has no product
//   409 TRACKER_MODE=real — a metric gate an admin could clear by hand would
//       not be a metric gate (docs/DECISIONS.md, 2026-09-14)
//
// This is the demo's "flip the tracker" control: set paymentsLive, land the
// tenth workflow run, raise a self-payment flag, and watch the spine move. Every
// use writes an AuditLog row naming the admin who did it.

export const dynamic = "force-dynamic";

const signalsSchema = z
  .object({
    paymentsLive: z.boolean(),
    trackerConnected: z.boolean(),
    workflowTenRuns: z.boolean(),
    hasPayingCustomer: z.boolean(),
    payingCustomers: z.number().int().nonnegative(),
    grossTotal: z.number().nonnegative(),
    netTotal: z.number().nonnegative(),
    currency: z.string().min(1),
    workflowRuns: z.number().int().nonnegative(),
    blockingFlags: z.array(z.string()),
  })
  .partial();

const bodySchema = z.object({ userId: z.string().min(1), signals: signalsSchema }).strict();

export const POST = withAuth(
  async (req, { user }) => {
    if (resolveTrackerMode() === "real") {
      return Response.json(
        { error: "The fake tracker is disabled while TRACKER_MODE=real." },
        { status: 409 },
      );
    }
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

    const product = await prisma.shipyardProduct.findUnique({
      where: { userId: parsed.data.userId },
      select: { id: true, trackerProductId: true },
    });
    if (!product) return Response.json({ error: "That student has no product." }, { status: 404 });

    // In fake mode the tracker id IS the product id, so connect it if the
    // demo has not already done so — otherwise the signals are written and
    // nothing ever reads them.
    if (!product.trackerProductId) {
      await prisma.shipyardProduct.update({
        where: { id: product.id },
        data: { trackerProductId: product.id },
      });
    }

    let signals;
    try {
      signals = await setFakeSignals(product.id, parsed.data.signals, user.userId);
    } catch (err) {
      if (err instanceof FakeTrackerDisabledError) {
        return Response.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }

    const states = await recomputeGates(product.id);

    await prisma.auditLog.create({
      data: {
        actorId: user.userId,
        action: "shipyard.fake-tracker.set",
        targetType: "ShipyardProduct",
        targetId: product.id,
        after: { userId: parsed.data.userId, signals } as unknown as Prisma.InputJsonValue,
      },
    });

    return Response.json({
      signals,
      states: states.map((s) => ({ key: s.key, order: s.order, state: s.state, reason: s.reason })),
    });
  },
  { role: "admin" },
);
