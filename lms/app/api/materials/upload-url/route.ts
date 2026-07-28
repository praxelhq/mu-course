import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  S3NotConfiguredError,
  UploadRejectedError,
  keyForMaterial,
  presignPut,
} from "@/lib/s3";

// Instructor material uploads, step 1: hand back a presigned PUT + the final
// key (materials/session{no}/{filename}). The browser PUTs directly to S3;
// step 2 (POST /api/materials) records the row. No bytes touch the app tier.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionNo: z.number().int().min(1).max(10),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export const POST = withAuth(
  async (req) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const { sessionNo, filename, contentType, sizeBytes } = parsed.data;

    const key = keyForMaterial(sessionNo, filename);
    try {
      const { url, headers } = await presignPut({ key, contentType, maxBytes: sizeBytes });
      return Response.json({ url, key, headers });
    } catch (err) {
      if (err instanceof UploadRejectedError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof S3NotConfiguredError) {
        return Response.json({ error: "Storage not configured" }, { status: 503 });
      }
      throw err;
    }
  },
  { role: "instructor" },
);
