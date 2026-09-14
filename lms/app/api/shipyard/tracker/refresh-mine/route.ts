import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { takeToken } from "@/lib/shipyard/rate-limit";
import { refreshTrackerForProduct } from "@/lib/shipyard/tracker-refresh";

// POST /api/shipyard/tracker/refresh-mine   (any signed-in student)
//   200 { reachedTracker, signals, states }
//   404 you have no product yet
//   409 your product is not connected to Shipped.money
//   429 once a minute is plenty
//
// The button behind "Refresh" on the signal strip. A student who has just
// taken a payment should not have to wait up to fifteen minutes for the sweep
// to notice, and refreshing is the one thing they can honestly do about a
// metric gate — the numbers themselves are still entirely the tracker's.
//
// One a minute, per student, in memory. The real bound on cost is that a
// refresh is one tracker read; the limit exists so a held-down button is not
// 300 of them.

export const dynamic = "force-dynamic";

export const REFRESH_LIMIT_PER_MINUTE = 1;

export const POST = withAuth(async (_req, { user }) => {
  const product = await prisma.shipyardProduct.findUnique({
    where: { userId: user.userId },
    select: { id: true, trackerProductId: true },
  });
  if (!product) {
    return Response.json({ error: "You have no product yet." }, { status: 404 });
  }
  if (!product.trackerProductId) {
    return Response.json(
      { error: "Connect your Shipped.money project first — there is nothing to read yet." },
      { status: 409 },
    );
  }

  const verdict = takeToken(`shipyard:refresh:${user.userId}`, {
    limit: REFRESH_LIMIT_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!verdict.allowed) {
    return Response.json(
      {
        error: "You just refreshed. Try again in a moment.",
        retryAfterSeconds: verdict.retryAfterSeconds,
      },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  try {
    const result = await refreshTrackerForProduct(product.id);
    return Response.json({
      reachedTracker: result.signals !== null,
      signals: result.signals,
      states: result.states.map((s) => ({
        key: s.key,
        order: s.order,
        state: s.state,
        reason: s.reason,
      })),
    });
  } catch (err) {
    const res = shipyardErrorResponse(err);
    if (res) return res;
    throw err;
  }
});
