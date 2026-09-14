import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { GRADE_COMPONENT_KEYS } from "@/lib/shipyard/scoring";
import { activateWeights, listWeights } from "@/lib/shipyard/weights";

// GET  /api/shipyard/admin/weights            (admin only)
//   200 { versions: [{ version, weights, active, createdAt }], active }
//
// POST /api/shipyard/admin/weights            (admin only)
//   body { version, weights: { productQuality, realNumbers, workflow, distribution } }
//   200 { version, weights, previousVersion, recompute }
//   400 a weight missing or negative, the four not summing to 100, or a bad
//       version label
//   409 that version label already exists — versions are history, not slots
//
// SPEC §7: "Weights live in a weightsVersion so they change by config, not
// code." Activating a version deactivates the previous one and then re-scores
// every PROVISIONAL grade. Finalised grades are left exactly as signed.

export const dynamic = "force-dynamic";

const weightsSchema = z
  .object({
    productQuality: z.number(),
    realNumbers: z.number(),
    workflow: z.number(),
    distribution: z.number(),
  })
  .strict();

const bodySchema = z.object({ version: z.string().min(1), weights: weightsSchema }).strict();

export const GET = withAuth(
  async () => {
    const versions = await listWeights();
    return Response.json({
      components: [...GRADE_COMPONENT_KEYS],
      versions,
      active: versions.find((v) => v.active) ?? null,
    });
  },
  { role: "admin" },
);

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        {
          error: "Give a version label and a number for each of the four components.",
          components: [...GRADE_COMPONENT_KEYS],
        },
        { status: 400 },
      );
    }
    try {
      const result = await activateWeights({ ...parsed.data, actorId: user.userId });
      return Response.json(result);
    } catch (err) {
      const res = shipyardErrorResponse(err);
      if (res) return res;
      throw err;
    }
  },
  { role: "admin" },
);
