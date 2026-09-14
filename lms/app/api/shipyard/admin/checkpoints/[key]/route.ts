import { withAuth } from "@/lib/auth";
import { editCheckpoint, isCheckpointKey } from "@/lib/shipyard/checkpoint-admin";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";

// PATCH /api/shipyard/admin/checkpoints/<key>   (admin only)
//   body may include title, barMarkdown, rubric, gateType, acceptsImages,
//   fieldSchema, metricSignals, deadlineAt, resubmitWindowHours,
//   resubmitCooldownMinutes
//   200 { checkpoint, sweep }
//   400 anything the validators refuse (a duplicate rubric id, an unknown
//       tracker signal, a metric gate with no signals, a field schema the
//       submit form could not render)
//   404 no such checkpoint
//
// `sweep` is non-null when the edit changed `gateType` or `metricSignals` —
// those move the answer `resolveGates` gives for every student at once, so the
// cohort is recomputed rather than left to drift until the next cron tick.
// Everything else (a bar, a rubric, a deadline) changes nobody's gate.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

export const PATCH = withAuth<Ctx>(
  async (req, { user, params }) => {
    const { key } = await params;
    if (!isCheckpointKey(key)) {
      return Response.json({ error: "No such checkpoint." }, { status: 404 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    try {
      const result = await editCheckpoint(key, body, user.userId);
      return Response.json(result);
    } catch (err) {
      const res = shipyardErrorResponse(err);
      if (res) return res;
      throw err;
    }
  },
  { role: "admin" },
);
