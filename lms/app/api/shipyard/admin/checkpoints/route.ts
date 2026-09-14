import { withAuth } from "@/lib/auth";
import { listCheckpoints, seedDefinitions } from "@/lib/shipyard/checkpoint-admin";
import { METRIC_SIGNAL_NAMES } from "@/lib/tracker/types";
import { FIELD_KINDS } from "@/lib/shipyard/fields";

// GET /api/shipyard/admin/checkpoints   (admin only)
//   200 { checkpoints, knownSignals, fieldKinds, seedDefinitions }
//
// The editor's whole payload, including the vocabularies it must not let an
// admin stray outside: the tracker signal names that exist, and the field
// kinds the submit form knows how to render. A checkpoint edited to require a
// signal nobody reports is a checkpoint that never clears.

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async () => {
    const checkpoints = await listCheckpoints();
    return Response.json({
      checkpoints,
      knownSignals: [...METRIC_SIGNAL_NAMES],
      fieldKinds: [...FIELD_KINDS],
      seedDefinitions: seedDefinitions(),
    });
  },
  { role: "admin" },
);
