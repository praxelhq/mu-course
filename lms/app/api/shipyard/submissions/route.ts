import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { shipyardErrorResponse } from "@/lib/shipyard/errors";
import { ensureProduct } from "@/lib/shipyard/products";
import { SUBMIT_RATE_LIMIT, takeToken } from "@/lib/shipyard/rate-limit";
import { createSubmission } from "@/lib/shipyard/submissions";
import { CHECKPOINT_ORDER } from "@/lib/shipyard/constants";

// POST /api/shipyard/submissions
//   body { checkpointKey, fields, files? }
//   201 { submissionId, status, version, nextAllowedResubmitAt }
//   400 invalid body / failed field validation / a dead or unreachable link
//   404 no product or no such checkpoint
//   409 checkpoint locked, already cleared, or already in review
//   429 inside the resubmit cooldown, or over the per-minute route limit
//
// A student only ever submits for themselves: the product is resolved from the
// session, never from the body.

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    checkpointKey: z.enum(CHECKPOINT_ORDER),
    fields: z.record(z.string(), z.unknown()),
    files: z.array(z.unknown()).optional(),
  })
  .strict();

export const POST = withAuth(async (req, { user }) => {
  const limit = takeToken(`shipyard:submit:${user.userId}`);
  if (!limit.allowed) {
    return Response.json(
      {
        error: `That is more than ${SUBMIT_RATE_LIMIT} submissions in a minute. Slow down.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  try {
    await ensureProduct(user.userId);
    const result = await createSubmission({
      userId: user.userId,
      checkpointKey: parsed.data.checkpointKey,
      fields: parsed.data.fields,
      files: parsed.data.files,
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    const res = shipyardErrorResponse(err);
    if (res) return res;
    throw err;
  }
});
