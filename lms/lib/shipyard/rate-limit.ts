// A small in-memory, per-user rate limit for the submit route.
//
// The resubmit cooldown (lib/shipyard/cooldown.ts) is the real rule and it is
// enforced in the database. This is only a bound on the SHAPE of abuse the
// cooldown does not cover: a script firing rejected submissions at the route,
// each of which costs a product read, a checkpoint read, a field validation and
// up to one liveness probe before the cooldown is even consulted.
//
// In-memory and per-process on purpose: it does not need to be exact, it must
// not add a round trip to the critical path of a deadline night, and a limit
// that resets on deploy is the correct trade for a guard that only exists to
// stop a loop.

export type RateLimitVerdict = { allowed: boolean; retryAfterSeconds: number };

const buckets = new Map<string, number[]>();

export const SUBMIT_RATE_LIMIT = 10;
export const SUBMIT_RATE_WINDOW_MS = 60_000;

/** Record an attempt for `key` and say whether it is allowed. */
export function takeToken(
  key: string,
  options: { limit?: number; windowMs?: number; now?: number } = {},
): RateLimitVerdict {
  const limit = options.limit ?? SUBMIT_RATE_LIMIT;
  const windowMs = options.windowMs ?? SUBMIT_RATE_WINDOW_MS;
  const now = options.now ?? Date.now();

  const kept = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (kept.length >= limit) {
    buckets.set(key, kept);
    const oldest = kept[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }
  kept.push(now);
  buckets.set(key, kept);

  // Cheap eviction: this map is one entry per active user, not per request.
  if (buckets.size > 5_000) {
    for (const [k, times] of buckets) {
      if (times.length === 0 || now - times[times.length - 1] >= windowMs) buckets.delete(k);
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test seam: forget every bucket. */
export function resetRateLimits(): void {
  buckets.clear();
}
