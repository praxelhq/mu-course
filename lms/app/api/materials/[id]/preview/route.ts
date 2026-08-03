import { withAuth } from "@/lib/auth";
import { parseCsvPreview } from "@/lib/csv-preview";
import { resolveMaterialAccess } from "@/lib/materials";
import { presignGet, rangedRead, s3Configured, s3ErrorResponse } from "@/lib/s3";

// Material "Peek": same auth + gate rules as download.
//   csv          → bounded ranged read (first ~256KB), first 100 rows as JSON
//   pdf / images → { url } (presigned GET) for inline <embed>/<img> viewing
// The CSV path is the one sanctioned exception to "no bytes through the app
// tier": a bounded ~256KB read, never the whole object.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const EXT_KIND: Record<string, "csv" | "pdf" | "image"> = {
  csv: "csv",
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
};

export const GET = withAuth<Ctx>(async (req, { user, params }) => {
  const { id } = await params;
  const access = await resolveMaterialAccess(user, id);
  if (!access.ok) return Response.json({ error: "Not found" }, { status: access.status });

  const key = access.material.s3Key;
  if (!key) return Response.json({ error: "Not found" }, { status: 404 });
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const kind = EXT_KIND[ext];
  if (!kind) return Response.json({ error: "No preview for this file type" }, { status: 415 });
  if (!s3Configured()) {
    return Response.json({ error: "Storage not configured" }, { status: 503 });
  }

  try {
    if (kind === "csv") {
      const bytes = await rangedRead(key);
      const { headers, rows, truncated } = parseCsvPreview(new TextDecoder().decode(bytes));
      return Response.json({ type: "csv", headers, rows, truncated });
    }
    const url = await presignGet(key); // inline: no attachment disposition
    return Response.json({ type: kind, url });
  } catch (err) {
    const res = s3ErrorResponse(err);
    if (res) return res;
    throw err;
  }
});
