// Where a student's Shipped.money project lives, for the one link the spine
// shows once a product is connected.
//
// `SHIPPED_MONEY_BASE_URL` is the same variable `lib/tracker/real.ts` uses for
// the service-to-service call, so the link a student clicks and the API this
// portal reads can never point at two different trackers. The fallback is the
// tracker's current Railway origin; it is a display link only, never a fetch,
// so a stale value shows a dead link rather than leaking a request anywhere.

export const SHIPPED_MONEY_FALLBACK_BASE_URL =
  "https://web-production-f46c6.up.railway.app";

export function trackerBaseUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const raw = (env.SHIPPED_MONEY_BASE_URL ?? "").trim();
  if (!raw) return SHIPPED_MONEY_FALLBACK_BASE_URL;
  return raw.replace(/\/+$/, "");
}

/** The public page for one project slug. */
export function trackerProjectUrl(slug: string, base = trackerBaseUrl()): string {
  return `${base}/p/${encodeURIComponent(slug)}`;
}
