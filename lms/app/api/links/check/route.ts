import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { SafeFetchBlockedError, safeFetch } from "@/lib/net/safe-fetch";

// U8 — inline "Check link" for the submission form: HEAD (GET fallback on
// 405) through lib/net/safe-fetch — never a raw fetch of user input.
//
// Rate limiting is a per-user in-memory token bucket (~10/min). Caveat: on
// Railway with >1 web instance each instance keeps its own bucket, so the
// effective limit is N×10/min. Acceptable for a link checker; move to a
// shared store if it ever matters.

export const dynamic = "force-dynamic";

const BUCKET_CAPACITY = 10;
const REFILL_PER_MS = BUCKET_CAPACITY / 60_000; // 10 tokens per minute

type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

function takeToken(userId: string): boolean {
  const now = Date.now();
  const b = buckets.get(userId) ?? { tokens: BUCKET_CAPACITY, last: now };
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + (now - b.last) * REFILL_PER_MS);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(userId, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(userId, b);
  return true;
}

const bodySchema = z.object({ url: z.string().min(1).max(2000) });

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  if (!takeToken(user.userId)) {
    return Response.json({ error: "Too many link checks — wait a minute" }, { status: 429 });
  }

  try {
    let out = await safeFetch(parsed.data.url, { method: "HEAD", timeoutMs: 8000 });
    if (out.status === 405) {
      out = await safeFetch(parsed.data.url, { method: "GET", timeoutMs: 8000 });
    }
    return Response.json({ ok: out.ok, status: out.status });
  } catch (err) {
    if (err instanceof SafeFetchBlockedError) {
      return Response.json({ ok: false, status: 0, blocked: true });
    }
    // Network failure / timeout → the link is dead as far as the student cares.
    return Response.json({ ok: false, status: 0 });
  }
});
