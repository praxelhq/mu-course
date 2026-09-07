import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  ReviewActionError,
  resolveSelectedGradeHolds,
} from "@/lib/review-queue";

const bodySchema = z.object({
  cause: z.string().trim().min(1).max(128),
  selected: z
    .array(
      z.object({
        holdId: z.string().min(1),
        expectedUpdatedAt: z.string().datetime(),
      }),
    )
    .min(1)
    .max(200),
  confirmed: z.boolean().default(false),
  reason: z.string().trim().min(1).max(2_000).optional(),
});

export const POST = withAuth(
  async (req, { user }) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 },
      );
    }
    try {
      const result = await resolveSelectedGradeHolds({
        ...parsed.data,
        actorId: user.userId,
      });
      return Response.json({
        ok: parsed.data.confirmed,
        needsConfirm: !parsed.data.confirmed,
        ...result,
      });
    } catch (error) {
      if (error instanceof ReviewActionError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  },
  { role: "instructor" },
);
