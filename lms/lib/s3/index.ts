import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// The ONLY module that imports the AWS SDK (CLAUDE.md: the app tier never
// proxies file bytes — everything moves through presigned URLs; the single
// exception is rangedRead, a bounded first-256KB GET used for CSV previews).
//
// Local dev runs without AWS env: s3Configured() is false and every presign
// call throws S3NotConfiguredError, which routes/UI turn into a graceful
// "storage not configured" state.
//
// Key namespaces (U8 depends on the exact submission convention):
//   materials   → materials/session{no}/{filename}
//   submissions → submissions/{userId}/{submissionId}/{filename}

const MB = 1024 * 1024;

export const PUT_TTL_SECONDS = 600; // ~10 min
export const GET_TTL_SECONDS = 300; // ~5 min
export const PREVIEW_BYTES = 256 * 1024; // first ~256KB for CSV previews
export const MAX_MP4_BYTES = 200 * MB;

/** Content-type allowlist for uploads, each with its size cap in bytes. */
export const UPLOAD_TYPE_CAPS: Record<string, number> = {
  // images
  "image/png": 25 * MB,
  "image/jpeg": 25 * MB,
  "image/gif": 25 * MB,
  "image/webp": 25 * MB,
  // documents / data
  "application/pdf": 50 * MB,
  "application/json": 25 * MB,
  "application/zip": 100 * MB,
  "application/x-zip-compressed": 100 * MB,
  "application/gzip": 100 * MB,
  "text/csv": 50 * MB,
  "text/plain": 25 * MB,
  // media
  "video/mp4": MAX_MP4_BYTES,
  "audio/mpeg": 50 * MB,
  "audio/mp4": 50 * MB,
  "audio/wav": 50 * MB,
  "audio/ogg": 50 * MB,
};

export class S3NotConfiguredError extends Error {
  constructor() {
    super("S3 storage is not configured (missing S3_BUCKET / region env)");
    this.name = "S3NotConfiguredError";
  }
}

/** Upload rejected before signing: 415 (type not allowed) or 413 (too large). */
export class UploadRejectedError extends Error {
  readonly status: 413 | 415;
  constructor(status: 413 | 415, message: string) {
    super(message);
    this.name = "UploadRejectedError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/** Basename only, unsafe characters collapsed to "_" — never path segments. */
function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const safe = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
  return safe || "file";
}

export function keyForMaterial(sessionNo: number, filename: string): string {
  return `materials/session${sessionNo}/${sanitizeFilename(filename)}`;
}

/** U8 contract: per-user namespace for submission uploads. */
export function keyForSubmission(userId: string, submissionId: string, filename: string): string {
  return `submissions/${userId}/${submissionId}/${sanitizeFilename(filename)}`;
}

/** U8: per-team namespace for company sign-off evidence (U15 reads these). */
export function keyForSignoff(teamId: string, filename: string): string {
  return `signoffs/${teamId}/${Date.now()}_${sanitizeFilename(filename)}`;
}

// ---------------------------------------------------------------------------
// DI seam — tests inject fake signing/reading; prod uses the real SDK client
// ---------------------------------------------------------------------------

export type SignDescriptor = {
  command: "put" | "get";
  key: string;
  contentType?: string;
  responseContentDisposition?: string;
  expiresIn: number;
};

export type S3TestOverrides = {
  configured?: boolean;
  sign?: (d: SignDescriptor) => string | Promise<string>;
  read?: (key: string, range: string) => Promise<Uint8Array>;
};

let overrides: S3TestOverrides | null = null;

/** Test seam: replace configuration/signing/reading. Pass null to restore. */
export function __setS3TestOverrides(o: S3TestOverrides | null): void {
  overrides = o;
}

function envBucket(): string | undefined {
  return process.env.S3_BUCKET;
}
function envRegion(): string | undefined {
  return process.env.S3_REGION ?? process.env.AWS_REGION;
}

export function s3Configured(): boolean {
  if (overrides?.configured !== undefined) return overrides.configured;
  return Boolean(envBucket() && envRegion());
}

let client: S3Client | null = null;
function realClient(): S3Client {
  client ??= new S3Client({ region: envRegion() });
  return client;
}

function requireConfigured(): void {
  if (!s3Configured()) throw new S3NotConfiguredError();
}

async function sign(d: SignDescriptor): Promise<string> {
  if (overrides?.sign) return overrides.sign(d);
  const bucket = envBucket()!;
  const command =
    d.command === "put"
      ? new PutObjectCommand({ Bucket: bucket, Key: d.key, ContentType: d.contentType })
      : new GetObjectCommand({
          Bucket: bucket,
          Key: d.key,
          ResponseContentDisposition: d.responseContentDisposition,
        });
  return getSignedUrl(realClient(), command, { expiresIn: d.expiresIn });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PresignedPut = { url: string; key: string; headers: Record<string, string> };

/**
 * Presigned PUT for direct browser→S3 uploads. Validates the content type
 * against the allowlist and the declared size against the per-type cap
 * BEFORE signing (so callers get typed 413/415 failures without S3 access).
 */
export async function presignPut(args: {
  key: string;
  contentType: string;
  maxBytes: number;
}): Promise<PresignedPut> {
  const { key, contentType, maxBytes } = args;
  const cap = UPLOAD_TYPE_CAPS[contentType.toLowerCase()];
  if (!cap) {
    throw new UploadRejectedError(415, `Content type not allowed: ${contentType}`);
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || maxBytes > cap) {
    throw new UploadRejectedError(
      413,
      `File too large for ${contentType}: max ${Math.floor(cap / MB)}MB`,
    );
  }
  requireConfigured();
  const url = await sign({ command: "put", key, contentType, expiresIn: PUT_TTL_SECONDS });
  return { url, key, headers: { "Content-Type": contentType } };
}

/** Presigned GET (short TTL). downloadName forces an attachment disposition. */
export async function presignGet(
  key: string,
  opts: { downloadName?: string } = {},
): Promise<string> {
  requireConfigured();
  return sign({
    command: "get",
    key,
    responseContentDisposition: opts.downloadName
      ? `attachment; filename="${sanitizeFilename(opts.downloadName)}"`
      : undefined,
    expiresIn: GET_TTL_SECONDS,
  });
}

/**
 * Bounded server-side read of the first `bytes` of an object (CSV preview
 * only). This is a ranged GET, capped at ~256KB — not a byte proxy.
 */
export async function rangedRead(key: string, bytes: number = PREVIEW_BYTES): Promise<Uint8Array> {
  requireConfigured();
  const range = `bytes=0-${bytes - 1}`;
  if (overrides?.read) return overrides.read(key, range);
  const res = await realClient().send(
    new GetObjectCommand({ Bucket: envBucket()!, Key: key, Range: range }),
  );
  if (!res.Body) return new Uint8Array(0);
  return res.Body.transformToByteArray();
}
