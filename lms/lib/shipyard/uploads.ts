// What a Shipyard upload may be, and where it lands.
//
// The Forge's `UPLOAD_TYPE_CAPS` is a course-wide allowlist; this is the
// Shipyard's own, deliberately narrower list — a checkpoint takes photographs
// of screens, a PDF, a short clip, or a note, and nothing else. Anything here
// must also be in the Forge allowlist, because `presignPut` signs against that.
//
// Keys are scoped by PRODUCT, never by user: `createSubmission` verifies a
// submitted key by prefix, and a prefix that names the product is the same fact
// the database already holds about who owns it.

const MB = 1024 * 1024;

/** contentType -> cap in bytes. Stricter than the Forge's global caps. */
export const SHIPYARD_UPLOAD_CAPS: Record<string, number> = {
  "image/png": 25 * MB,
  "image/jpeg": 25 * MB,
  "image/webp": 25 * MB,
  "image/heic": 25 * MB,
  "application/pdf": 50 * MB,
  "video/mp4": 200 * MB,
  "text/markdown": 2 * MB,
  "text/plain": 2 * MB,
};

/** `image/jpg` is not a media type, but it is what half the world sends. */
export function normaliseContentType(raw: string): string {
  const value = raw.split(";")[0].trim().toLowerCase();
  if (value === "image/jpg" || value === "image/pjpeg") return "image/jpeg";
  if (value === "text/md" || value === "application/markdown") return "text/markdown";
  return value;
}

export function shipyardUploadCap(contentType: string): number | null {
  return SHIPYARD_UPLOAD_CAPS[normaliseContentType(contentType)] ?? null;
}

/** Every object belonging to one product sits under this prefix. */
export function keyPrefixForProduct(productId: string): string {
  return `shipyard/${productId}/`;
}

/**
 * The display name for a stored object, derived from the KEY rather than from
 * whatever the client called the file.
 *
 * `keyForShipyardUpload` mints `<uploadId>-<sanitised filename>`, so the
 * filename is already through `sanitizeFilename` on the way in and the name
 * shown to a student, an instructor and the reviewer is a fact about the
 * object in the bucket instead of a claim in a request body. A client-supplied
 * `name` reached the instructor drill-down and the reviewer's prompt verbatim.
 */
export function displayNameFromKey(key: string): string {
  const last = key.split("/").filter(Boolean).pop() ?? "";
  // Strip the server-minted uploadId prefix, when the key carries one.
  const withoutId = last.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    "",
  );
  const name = (withoutId || last).slice(0, 200);
  return name || "file";
}
