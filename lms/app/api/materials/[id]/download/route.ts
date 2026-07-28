import { withAuth } from "@/lib/auth";
import { resolveMaterialAccess } from "@/lib/materials";
import { S3NotConfiguredError, presignGet, s3Configured } from "@/lib/s3";

// One-click material download: auth + gate check (resolveGate with userId —
// per-student exceptions and the parent-session rule both apply), then a 302
// to a short-TTL presigned GET. The app tier never touches the bytes.
// Everything unavailable is a uniform 404; nothing sensitive is logged.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (req, { user, params }) => {
  const { id } = await params;
  const access = await resolveMaterialAccess(user, id);
  if (!access.ok) return Response.json({ error: "Not found" }, { status: access.status });

  const { material } = access;
  if (!material.s3Key) {
    // Link-kind materials have no file; the hub renders a launcher instead.
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!s3Configured()) {
    return Response.json({ error: "Storage not configured" }, { status: 503 });
  }
  try {
    const downloadName = material.s3Key.split("/").pop() ?? "download";
    const url = await presignGet(material.s3Key, { downloadName });
    return Response.redirect(url, 302);
  } catch (err) {
    if (err instanceof S3NotConfiguredError) {
      return Response.json({ error: "Storage not configured" }, { status: 503 });
    }
    throw err;
  }
});
