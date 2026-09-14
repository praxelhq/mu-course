import { withAuth } from "@/lib/auth";
import { loadCostMeter } from "@/lib/shipyard/review-costs";

// GET /api/shipyard/admin/costs   (admin)
//   → 200 CostMeter
//
// SPEC §6.5's cost meter: totals and breakdowns by model, by feature, by
// checkpoint and by day, the review counts beside them, the dead-letter list,
// and the kill-switch banner state.
//
// Two sources on purpose — CostLog for every model call (pre-flight and
// escalation included), ShipyardReview for the per-checkpoint verdict spend,
// which is the only one of the two that knows what a call bought. See
// lib/shipyard/review-costs.ts for why they are not reconciled into one.

export const dynamic = "force-dynamic";

export const GET = withAuth(async () => Response.json(await loadCostMeter()), {
  role: "admin",
});
