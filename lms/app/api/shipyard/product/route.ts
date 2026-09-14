import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { ensureProduct, renameProduct } from "@/lib/shipyard/products";

// POST /api/shipyard/product
//   body { name, oneLiner } → 200 { product }
//
// Renaming is allowed at any point in the course, cleared checkpoints included.
// A product's name is the student's, not the portal's: they rename things as
// the thing itself changes, and a checkpoint 1 pass is not a decision to freeze
// a name for six weeks. Nothing is audit-logged — there is nothing here anyone
// needs to reconstruct later.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    name: z.string().min(1).max(120),
    oneLiner: z.string().max(400),
  })
  .strict();

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  try {
    const product = await ensureProduct(user.userId);
    const updated = await renameProduct(product.id, parsed.data);
    return Response.json({ product: updated });
  } catch (err) {
    const res = shipyardErrorResponse(err);
    if (res) return res;
    throw err;
  }
});
