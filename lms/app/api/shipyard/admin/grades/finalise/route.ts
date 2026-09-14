import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { finaliseGrades } from "@/lib/shipyard/grades";

// POST /api/shipyard/admin/grades/finalise   (admin only)
//   body { userId? | sectionId?, reason, force? } → 200 { finalised, refused }
//   400 neither a student nor a section named, or a reason too thin
//   404 nothing matched
//
// Finalising is the moment a provisional number becomes the number. After it,
// `computeProductGrade` refuses to touch that grade ever again — a tracker
// refresh or a late re-review cannot move a signed grade (DECISIONS,
// 2026-09-15). That is why the reason is required and every product gets its
// own AuditLog row.
//
// Only a product that has cleared all six checkpoints may be finalised: the
// graduation condition is what the number means. `force: true` exists for the
// genuine edge cases (a withdrawal, a medical case) and is recorded as forced.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    userId: z.string().min(1).optional(),
    sectionId: z.string().min(1).optional(),
    reason: z.string().trim().min(8).max(500),
    force: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Boolean(b.userId) || Boolean(b.sectionId), {
    message: "Name a student or a section.",
  });

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        {
          error:
            "Name a student or a section, and a reason of at least eight characters.",
        },
        { status: 400 },
      );
    }

    try {
      const result = await finaliseGrades({ ...parsed.data, actorId: user.userId });
      return Response.json(result);
    } catch (err) {
      const res = shipyardErrorResponse(err);
      if (res) return res;
      throw err;
    }
  },
  { role: "admin" },
);
