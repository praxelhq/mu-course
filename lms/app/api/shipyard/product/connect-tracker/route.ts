import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { connectTracker, ensureProduct } from "@/lib/shipyard/products";

// POST /api/shipyard/product/connect-tracker
//   body { url } → 200 { trackerProductId }
//   400 anything that is not a Shipped.money project link or bare slug
//
// Gates are recomputed on the same request, so a student whose numbers already
// qualify sees the metric gate move the moment they connect rather than at the
// next sweep.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().min(1).max(500) }).strict();

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    const product = await ensureProduct(user.userId);
    const { trackerProductId } = await connectTracker(product.id, parsed.data.url);
    return Response.json({ trackerProductId });
  } catch (err) {
    const res = shipyardErrorResponse(err);
    if (res) return res;
    throw err;
  }
});
