import { z } from "zod";
import { prisma } from "@/lib/db";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import {
  productIdForSlug,
  refreshTrackerForProduct,
  serviceToken,
  verifyRefreshCallback,
} from "@/lib/shipyard/tracker-refresh";

// POST /api/shipyard/tracker/refresh
//
// Shipped.money's callback: "this project's numbers changed, read them again."
// SPEC §5 requires gate resolution to be recomputed "on every tracker refresh
// callback", and this is that callback.
//
// AUTH — no Clerk. The caller is a server, not a browser, so there is no
// session to hold. Three things must all hold, and any failure is the same
// uniform 401 (telling a caller which half of its credentials was wrong tells
// an attacker which half to keep):
//   Authorization:        Bearer ${SHIPPED_MONEY_SERVICE_TOKEN}  (constant-time)
//   X-Shipyard-Timestamp: unix SECONDS, within ±300s of now
//   X-Shipyard-Signature: hex HMAC-SHA256, keyed with the same token, over
//                         `${timestamp}:${slug}`
// It is the same scheme this portal signs its OWN reads to the tracker with
// (`lib/tracker/real.ts`), so one shared secret covers both directions and a
// leaked bearer replayed from elsewhere still fails the HMAC.
//
// 503 when the token is unset: an unconfigured callback is off, not open.
// This route is in proxy.ts's public list — see the comment there.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ slug: z.string().trim().min(1).max(120) }).strict();

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(req: Request): Promise<Response> {
  const token = serviceToken();
  if (!token) {
    return Response.json({ error: "Tracker callback is not configured" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  // A malformed body is answered as 401 too: the signature covers the slug, so
  // without a readable slug there is nothing to verify against.
  if (!parsed.success) return unauthorized();
  const { slug } = parsed.data;

  const ok = verifyRefreshCallback(
    {
      authorization: req.headers.get("authorization"),
      timestamp: req.headers.get("x-shipyard-timestamp"),
      signature: req.headers.get("x-shipyard-signature"),
    },
    slug,
    token,
  );
  if (!ok) return unauthorized();

  const productId = await productIdForSlug(slug, prisma);
  // An unknown slug is not an auth failure: the tracker may legitimately call
  // about a project nobody in this cohort has connected.
  if (!productId) {
    return Response.json({ ok: true, known: false, states: [] });
  }

  try {
    const result = await refreshTrackerForProduct(productId);
    return Response.json({
      ok: true,
      known: true,
      reachedTracker: result.signals !== null,
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
}
