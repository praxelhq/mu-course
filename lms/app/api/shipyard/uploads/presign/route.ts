import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { keyForShipyardUpload, presignPut, s3ErrorResponse, s3Configured } from "@/lib/s3";
import { CHECKPOINT_ORDER } from "@/lib/shipyard/constants";
import { ensureProduct } from "@/lib/shipyard/products";
import { normaliseContentType, shipyardUploadCap } from "@/lib/shipyard/uploads";

// POST /api/shipyard/uploads/presign
//   body { checkpointKey, filename, contentType, bytes }
//   200 { url, key, headers } — PUT the file straight to S3 with those headers
//   400 invalid body
//   413 over the Shipyard's cap for that type
//   415 a type the Shipyard does not take
//   503 storage is not configured
//
// The key is derived server-side from the session's product and never from the
// body, which is what makes the prefix check in lib/shipyard/submissions a real
// ownership check. The app tier never sees the bytes (CLAUDE.md invariant).

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    checkpointKey: z.enum(CHECKPOINT_ORDER),
    filename: z.string().min(1).max(200),
    contentType: z.string().min(1).max(200),
    bytes: z.number().int().positive(),
  })
  .strict();

const MB = 1024 * 1024;

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { checkpointKey, filename, bytes } = parsed.data;
  const contentType = normaliseContentType(parsed.data.contentType);

  const cap = shipyardUploadCap(contentType);
  if (cap === null) {
    return Response.json(
      { error: `We do not take ${contentType} here. Images, PDFs, MP4 or a note.` },
      { status: 415 },
    );
  }
  if (bytes > cap) {
    return Response.json(
      { error: `That file is too large: ${Math.floor(cap / MB)}MB is the limit for ${contentType}.` },
      { status: 413 },
    );
  }
  if (!s3Configured()) {
    return Response.json({ error: "Storage not configured" }, { status: 503 });
  }

  const product = await ensureProduct(user.userId);
  const key = keyForShipyardUpload({
    productId: product.id,
    checkpointKey,
    uploadId: randomUUID(),
    filename,
  });

  try {
    const presigned = await presignPut({ key, contentType, maxBytes: bytes, oneTime: true });
    return Response.json(presigned);
  } catch (err) {
    const res = s3ErrorResponse(err);
    if (res) return res;
    throw err;
  }
});
