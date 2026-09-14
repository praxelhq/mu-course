import { withAuth } from "@/lib/auth";
import { isCheckpointKey, resetCheckpointToSeed } from "@/lib/shipyard/checkpoint-admin";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";

// POST /api/shipyard/admin/checkpoints/reset-to-seed/<key>   (admin only)
//   200 { checkpoint, sweep }
//   404 no such checkpoint
//
// Undo, for the editor. `lib/shipyard/checkpoints.ts` holds the known-good
// copy of every bar, rubric and field schema — the ones the fixture set was
// built against — so an edit that went wrong is one click from the version
// the reviewer was evaluated on, rather than a retyping job from a git diff.
//
// The before/after lands in AuditLog like any other edit: a reset is an edit.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export const POST = withAuth<Ctx>(
  async (_req, { user, params }) => {
    const { key } = await params;
    if (!isCheckpointKey(key)) {
      return Response.json({ error: "No such checkpoint." }, { status: 404 });
    }
    try {
      const result = await resetCheckpointToSeed(key, user.userId);
      return Response.json(result);
    } catch (err) {
      const res = shipyardErrorResponse(err);
      if (res) return res;
      throw err;
    }
  },
  { role: "admin" },
);
