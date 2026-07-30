import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  NodeHttpHandler,
  type NodeHttpHandlerOptions,
} from "@smithy/node-http-handler";

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

/** Fail fast on an unreachable endpoint instead of inheriting the SDK's disabled timeout. */
export const S3_CONNECTION_TIMEOUT_MS = 5_000;
/** Bound an idle S3 socket while still allowing normal ranged reads and small worker PUTs. */
export const S3_SOCKET_TIMEOUT_MS = 30_000;
/** Total attempts, including the first request. Standard retry backoff remains SDK-owned. */
export const S3_MAX_ATTEMPTS = 3;

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
  "text/json": 25 * MB,
  "application/x-ndjson": 25 * MB,
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
  "audio/webm": 25 * MB, // U12 MediaRecorder answer clips
};

/** U12: interview answer clips are capped tighter than general audio. */
export const MAX_INTERVIEW_AUDIO_BYTES = 25 * MB;

export class S3NotConfiguredError extends Error {
  constructor() {
    super("S3 storage is not configured (missing S3_BUCKET / region env)");
    this.name = "S3NotConfiguredError";
  }
}

/** A server-side PUT cannot be attached safely without its immutable version. */
export class S3ObjectVersionMissingError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`S3 did not return an immutable VersionId for ${key}`);
    this.name = "S3ObjectVersionMissingError";
    this.key = key;
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

/**
 * Map a typed S3 error onto a JSON Response, or null if unknown — the same
 * pattern as lib/interview/http's interviewErrorResponse. Routes rethrow
 * anything this doesn't recognise.
 */
export function s3ErrorResponse(err: unknown): Response | null {
  if (err instanceof UploadRejectedError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof S3NotConfiguredError) {
    return Response.json({ error: "Storage not configured" }, { status: 503 });
  }
  return null;
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

function sanitizeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.{2,}/g, "_") || "_";
}

/** Server-derived reservation key; no path or role fragment comes from the client. */
export function keyForReservedSubmission(args: {
  ownerKind: "individual" | "team";
  ownerId: string;
  assignmentId: string;
  assessmentVersionId: string | null;
  version: number;
  attempt: number;
  fieldKey: string;
  reservationId: string;
  filename: string;
}): string {
  const contract = args.assessmentVersionId ?? "legacy";
  return [
    "submissions",
    sanitizeSegment(args.ownerKind),
    sanitizeSegment(args.ownerId),
    sanitizeSegment(args.assignmentId),
    sanitizeSegment(contract),
    `v${args.version}`,
    `attempt-${args.attempt}`,
    sanitizeSegment(args.fieldKey),
    sanitizeSegment(args.reservationId),
    sanitizeFilename(args.filename),
  ].join("/");
}

/** U8: per-team namespace for company sign-off evidence (U15 reads these). */
export function keyForSignoff(teamId: string, filename: string): string {
  return `signoffs/${teamId}/${Date.now()}_${sanitizeFilename(filename)}`;
}

/** U11: worker-captured app screenshots for the gallery App wall. */
export function keyForScreenshot(submissionId: string): string {
  return `gallery/screenshots/${sanitizeFilename(submissionId)}.png`;
}

/** Write-once screenshot key scoped to its durable generated-object reservation. */
export function keyForReservedScreenshot(
  submissionId: string,
  reservationId: string,
  contentSha256?: string,
): string {
  const digest = contentSha256 ? `-${sanitizeSegment(contentSha256)}` : "";
  return `gallery/screenshots/${sanitizeSegment(submissionId)}${digest}-${sanitizeSegment(reservationId)}.png`;
}

/**
 * U12: interview audio. Agent questions are q{turnNo}.mp3 (TTS output, written
 * server-side); student answers are a{turnNo}.{webm|mp3|m4a} (browser upload
 * via presigned PUT).
 */
export function keyForInterviewAudio(
  interviewId: string,
  kind: "q" | "a",
  turnNo: number,
  ext: string = "mp3",
): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp3";
  return `interviews/${sanitizeFilename(interviewId)}/${kind}${turnNo}.${safeExt}`;
}

/** Write-once interview-turn key scoped to its durable reservation. */
export function keyForReservedInterviewAudio(
  interviewId: string,
  kind: "q" | "a",
  turnNo: number,
  reservationId: string,
  ext: string = "mp3",
): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp3";
  return `interviews/${sanitizeSegment(interviewId)}/${kind}${turnNo}-${sanitizeSegment(reservationId)}.${safeExt}`;
}

/** Write-once LiveKit room recording key scoped to its durable reservation. */
export function keyForInterviewRecording(interviewId: string, reservationId: string): string {
  return `interviews/${sanitizeSegment(interviewId)}/room-${sanitizeSegment(reservationId)}.ogg`;
}

/** File extension for an allowed interview answer content type. */
export const INTERVIEW_AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

// ---------------------------------------------------------------------------
// DI seam — tests inject fake signing/reading; prod uses the real SDK client
// ---------------------------------------------------------------------------

export type SignDescriptor = {
  command: "put" | "get";
  key: string;
  contentType?: string;
  /** PUT only: exact byte length bound into the signature (enforces the cap). */
  contentLength?: number;
  /** PUT only: sign `If-None-Match: *` so a reservation key is write-once. */
  ifNoneMatch?: "*";
  versionId?: string;
  responseContentDisposition?: string;
  expiresIn: number;
};

export type S3TestOverrides = {
  configured?: boolean;
  sign?: (d: SignDescriptor) => string | Promise<string>;
  read?: (key: string, range: string) => Promise<Uint8Array>;
  head?: (key: string) => Promise<StoredObjectMetadata>;
  readVersion?: (key: string, versionId: string, expectedBytes: number) => Promise<Uint8Array>;
  listVersions?: (key: string) => Promise<string[]>;
  deleteVersion?: (
    key: string,
    versionId: string,
  ) => Promise<{ verified: boolean; providerReceipt?: string | null }>;
  write?: (
    key: string,
    body: Uint8Array,
    contentType: string,
  ) => Promise<{ versionId?: string | null; etag?: string | null } | void>;
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

export type S3HttpHandlerFactory = (
  options: NodeHttpHandlerOptions,
) => NodeHttpHandler;

/** Pure construction seam: tests inspect policy without opening a socket. */
export function createS3ClientConfig(
  region: string,
  createHandler: S3HttpHandlerFactory = (options) => new NodeHttpHandler(options),
): S3ClientConfig {
  return {
    region,
    maxAttempts: S3_MAX_ATTEMPTS,
    retryMode: "standard",
    requestHandler: createHandler({
      connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
      socketTimeout: S3_SOCKET_TIMEOUT_MS,
    }),
  };
}

function realClient(): S3Client {
  client ??= new S3Client(createS3ClientConfig(envRegion()!));
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
      ? new PutObjectCommand({
          Bucket: bucket,
          Key: d.key,
          ContentType: d.contentType,
          // Binds the exact content length into the signature: the presigned
          // URL will reject any body that is not exactly this many bytes, so
          // the per-type size cap is enforced at S3, not just client-side.
          ContentLength: d.contentLength,
          IfNoneMatch: d.ifNoneMatch,
        })
      : new GetObjectCommand({
          Bucket: bucket,
          Key: d.key,
          VersionId: d.versionId,
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
  /** Prevent a still-live presign from creating orphan object versions. */
  oneTime?: boolean;
}): Promise<PresignedPut> {
  const { key, contentType, maxBytes, oneTime = false } = args;
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
  // Callers pass the client-declared exact byte length as `maxBytes` (already
  // validated ≤ cap above). Bind it into the signature so S3 enforces it — the
  // browser's fetch PUT sends Content-Length = file.size, which must match.
  const url = await sign({
    command: "put",
    key,
    contentType,
    contentLength: maxBytes,
    ...(oneTime ? { ifNoneMatch: "*" as const } : {}),
    expiresIn: PUT_TTL_SECONDS,
  });
  return {
    url,
    key,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(maxBytes),
      ...(oneTime ? { "If-None-Match": "*" } : {}),
    },
  };
}

export type StoredObjectMetadata = {
  contentLength: number;
  contentType: string;
  etag: string;
  versionId: string;
};

/** Metadata used by the upload commit step; versioned buckets are mandatory. */
export async function headObject(key: string): Promise<StoredObjectMetadata> {
  requireConfigured();
  if (overrides?.head) return overrides.head(key);
  const result = await realClient().send(new HeadObjectCommand({ Bucket: envBucket()!, Key: key }));
  if (
    typeof result.ContentLength !== "number" ||
    !result.ContentType ||
    !result.ETag ||
    !result.VersionId
  ) {
    throw new Error("Uploaded object is missing required immutable metadata.");
  }
  return {
    contentLength: result.ContentLength,
    contentType: result.ContentType.toLowerCase(),
    etag: result.ETag.replace(/^\"|\"$/g, ""),
    versionId: result.VersionId,
  };
}

/** Read exactly the HEAD-observed immutable version for local inspection/hash. */
export async function readObjectVersion(
  key: string,
  versionId: string,
  expectedBytes: number,
): Promise<Uint8Array> {
  requireConfigured();
  if (!Number.isInteger(expectedBytes) || expectedBytes <= 0) {
    throw new Error("Expected object size must be a positive integer.");
  }
  if (overrides?.readVersion) return overrides.readVersion(key, versionId, expectedBytes);
  const result = await realClient().send(
    new GetObjectCommand({
      Bucket: envBucket()!,
      Key: key,
      VersionId: versionId,
      Range: `bytes=0-${expectedBytes - 1}`,
    }),
  );
  if (!result.Body) throw new Error("Uploaded object body is unavailable.");
  const bytes = await result.Body.transformToByteArray();
  if (bytes.byteLength !== expectedBytes) {
    throw new Error("Uploaded object length changed during commit inspection.");
  }
  return bytes;
}

/** List stored object versions for exactly one key (never prefix siblings). */
export async function listObjectVersionIds(key: string): Promise<string[]> {
  requireConfigured();
  if (overrides?.listVersions) {
    return [...new Set(await overrides.listVersions(key))].sort();
  }

  const versionIds = new Set<string>();
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  let pages = 0;
  do {
    pages += 1;
    if (pages > 20) throw new Error("S3 version listing exceeded the retention page limit");
    const result = await realClient().send(
      new ListObjectVersionsCommand({
        Bucket: envBucket()!,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    );
    for (const version of result.Versions ?? []) {
      if (version.Key === key && version.VersionId) versionIds.add(version.VersionId);
      if (versionIds.size > 1_000) {
        throw new Error("S3 key exceeded the retention version limit");
      }
    }
    if (!result.IsTruncated) break;
    keyMarker = result.NextKeyMarker;
    versionIdMarker = result.NextVersionIdMarker;
    if (!keyMarker) throw new Error("S3 version listing was truncated without a continuation key");
  } while (true);
  return [...versionIds].sort();
}

function isMissingObjectVersion(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NoSuchKey" ||
    candidate.name === "NoSuchVersion" ||
    candidate.name === "NotFound"
  );
}

/** Delete one immutable object version, then prove that exact version is gone. */
export async function deleteObjectVersion(
  key: string,
  versionId: string,
): Promise<{ verified: boolean; providerReceipt: string | null }> {
  requireConfigured();
  if (!key || !versionId) throw new Error("Exact S3 key and VersionId are required");
  if (overrides?.deleteVersion) {
    const result = await overrides.deleteVersion(key, versionId);
    return {
      verified: result.verified,
      providerReceipt: result.providerReceipt ?? null,
    };
  }

  const deleted = await realClient().send(
    new DeleteObjectCommand({ Bucket: envBucket()!, Key: key, VersionId: versionId }),
  );
  try {
    await realClient().send(
      new HeadObjectCommand({ Bucket: envBucket()!, Key: key, VersionId: versionId }),
    );
    return { verified: false, providerReceipt: deleted.$metadata.requestId ?? null };
  } catch (error) {
    if (!isMissingObjectVersion(error)) throw error;
    return { verified: true, providerReceipt: deleted.$metadata.requestId ?? null };
  }
}

/** Presigned GET (short TTL). downloadName forces an attachment disposition. */
export async function presignGet(
  key: string,
  opts: { downloadName?: string; versionId?: string } = {},
): Promise<string> {
  requireConfigured();
  return sign({
    command: "get",
    key,
    versionId: opts.versionId,
    responseContentDisposition: opts.downloadName
      ? `attachment; filename="${sanitizeFilename(opts.downloadName)}"`
      : undefined,
    expiresIn: GET_TTL_SECONDS,
  });
}

/**
 * Direct server-side PUT of a small object. WORKER-ONLY (U11 screenshot
 * capture) — the app tier never proxies file bytes (CLAUDE.md invariant);
 * browser uploads keep using presignPut.
 */
export type PutObjectReceipt = {
  versionId: string;
  etag: string | null;
};

function normalizePutReceipt(
  key: string,
  result: { versionId?: string | null; etag?: string | null } | void,
): PutObjectReceipt {
  if (!result) throw new S3ObjectVersionMissingError(key);
  const versionId = result.versionId?.trim();
  if (!versionId) throw new S3ObjectVersionMissingError(key);
  return {
    versionId,
    etag: result.etag?.replace(/^\"|\"$/g, "") ?? null,
  };
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<PutObjectReceipt> {
  requireConfigured();
  if (overrides?.write) {
    return normalizePutReceipt(key, await overrides.write(key, body, contentType));
  }
  const result = await realClient().send(
    new PutObjectCommand({ Bucket: envBucket()!, Key: key, Body: body, ContentType: contentType }),
  );
  return normalizePutReceipt(key, { versionId: result.VersionId, etag: result.ETag });
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
