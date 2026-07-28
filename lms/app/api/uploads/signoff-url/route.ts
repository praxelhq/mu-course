import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  S3NotConfiguredError,
  UploadRejectedError,
  keyForSignoff,
  presignPut,
} from "@/lib/s3";

// U8 — instructor: presigned PUT for sign-off evidence, scoped to the
// signoffs/{teamId}/ namespace.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  teamId: z.string().min(1),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export const POST = withAuth(
  async (req) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const { teamId, filename, contentType, sizeBytes } = parsed.data;

    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) return Response.json({ error: "Unknown team" }, { status: 404 });

    try {
      const key = keyForSignoff(teamId, filename);
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
