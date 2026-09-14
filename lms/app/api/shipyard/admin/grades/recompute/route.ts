import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import {
  FINALISE_CAP,
  productIdsForRecompute,
  recomputeGradesForProducts,
} from "@/lib/shipyard/grades";

// POST /api/shipyard/admin/grades/recompute   (admin only)
//   body { userId? } | { sectionId? } | { all: true } → 200 { summary, cap }
//   400 no scope named
//
// The manual version of the two hooks (`onReviewCompleted`, `onGatesRecomputed`).
// It exists because a derived number should always be rebuildable by hand: a
// weights change that half-failed, a tracker that was down for an hour, a
// grade nobody can explain.
//
// Capped at 500 products per call. Finalised grades are counted as `skipped`
// and left alone, which is the whole point of finalising them.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    userId: z.string().min(1).optional(),
    sectionId: z.string().min(1).optional(),
    all: z.literal(true).optional(),
  })
  .strict()
  .refine((b) => Boolean(b.userId) || Boolean(b.sectionId) || b.all === true, {
    message: "Name a student, a section, or all.",
  });

export const POST = withAuth(
  async (req) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: "Name a student, a section, or pass { all: true }." },
        { status: 400 },
      );
    }

    try {
      const productIds = await productIdsForRecompute(parsed.data);
      const summary = await recomputeGradesForProducts(productIds);
      return Response.json({
        products: productIds.length,
        cap: FINALISE_CAP,
        summary,
      });
    } catch (err) {
      const res = shipyardErrorResponse(err);
      if (res) return res;
      throw err;
    }
  },
  { role: "admin" },
);
