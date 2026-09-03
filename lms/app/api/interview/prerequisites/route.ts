import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { interviewErrorResponse } from "@/lib/interview/http";
import {
  PREREQUISITE_KINDS,
  commitPrerequisite,
  listPrerequisites,
  missingPrerequisites,
  presignPrerequisiteUpload,
} from "@/lib/interview/prerequisites";
import { s3ErrorResponse } from "@/lib/s3";
import { enqueuePrerequisitePrepare } from "@/lib/queue";

// The student's three interview prerequisites: resume, Make blueprint JSON,
// and sector map.
//
//   GET   → what they have uploaded and what is still missing
//   POST  → {action:"presign"} a one-time PUT, or {action:"commit"} a finished
//           upload. File bytes never traverse the app tier (S3 presigned only).
//
// The object key is always server-derived from the authenticated user, so one
// student can never presign or commit into another's namespace.

export const dynamic = "force-dynamic";

const kindSchema = z.enum(PREREQUISITE_KINDS);

const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("presign"),
      kind: kindSchema,
      contentType: z.string().min(1).max(200),
      sizeBytes: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("commit"),
      kind: kindSchema,
      s3Key: z.string().min(1).max(500),
    })
    .strict(),
]);

export const GET = withAuth(async (_req, { user }) => {
  const [uploaded, missing] = await Promise.all([
    listPrerequisites(user.userId),
    missingPrerequisites(user.userId),
  ]);
  return Response.json({
    // Deliberately no s3Key: the student has no reason to see object
    // coordinates, and the page only needs presence and provenance.
    uploaded: uploaded.map((row) => ({
      kind: row.kind,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.createdAt,
    })),
    missing,
    complete: missing.length === 0,
  });
});

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body; upload keys are server-derived." },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "presign") {
      const { s3Key, upload } = await presignPrerequisiteUpload({
        userId: user.userId,
        kind: parsed.data.kind,
        contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes,
      });
      return Response.json({ s3Key, url: upload.url, headers: upload.headers });
    }

    const row = await commitPrerequisite({
      userId: user.userId,
      kind: parsed.data.kind,
      s3Key: parsed.data.s3Key,
    });
    // Hand the artifact to the worker: it can read PDFs (this tier cannot —
    // see next.config.ts) and it owns the Anthropic call that turns a Make
    // blueprint into prose. Fire-and-forget, so the upload never waits on it.
    void enqueuePrerequisitePrepare({ userId: user.userId, kind: row.kind });

    const missing = await missingPrerequisites(user.userId);
    return Response.json({
      kind: row.kind,
      uploadedAt: row.createdAt,
      readable: row.readable,
      unreadableReason: row.unreadableReason,
      missing,
      complete: missing.length === 0,
    });
  } catch (err) {
    const mapped = interviewErrorResponse(err) ?? s3ErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});
