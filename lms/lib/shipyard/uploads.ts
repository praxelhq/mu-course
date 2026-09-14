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
