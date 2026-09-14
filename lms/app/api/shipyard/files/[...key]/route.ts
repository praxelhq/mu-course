import { withAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { presignGet, s3Configured, s3ErrorResponse, SHIPYARD_RENDER_PREFIX } from "@/lib/s3";
import { keyPrefixForProduct } from "@/lib/shipyard/uploads";

// GET /api/shipyard/files/shipyard/<productId>/<checkpoint>/<file>
//   302 → a short-TTL presigned GET, after checking the key's product prefix
//   belongs to the caller (staff may read any Shipyard key).
//
// Two prefixes, two rules:
//   `shipyard/<productId>/`   the student's own uploads — theirs, and staff's.
//   `shipyard-renders/`       the worker's headless renders of live products.
//                             STAFF ONLY. A render is not the student's
//                             upload: it is a screenshot the worker took of
//                             whatever their URL served at review time, and it
//                             is evidence in the instructor drill-down.
//
// A catch-all segment because the key has slashes in it. Everything the caller
// may not have is a uniform 404: a 403 here would confirm that a key exists,
// which is exactly what someone probing for other students' screenshots wants
// to learn. The app tier never proxies the bytes.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string[] }> };

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

export const GET = withAuth<Ctx>(async (req, { user, params }) => {
  const { key: segments } = await params;
  const key = (segments ?? []).join("/");
  if (!key || key.includes("..")) return notFound();

  const isUpload = key.startsWith("shipyard/");
  const isRender = key.startsWith(SHIPYARD_RENDER_PREFIX);
  if (!isUpload && !isRender) return notFound();

  const staff = user.role === "instructor" || user.role === "admin";
  if (!staff) {
    if (isRender) return notFound();
    const product = await prisma.shipyardProduct.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    if (!product || !key.startsWith(keyPrefixForProduct(product.id))) return notFound();
  }

  if (!s3Configured()) {
    return Response.json({ error: "Storage not configured" }, { status: 503 });
  }
  try {
    const url = await presignGet(key);
    return Response.redirect(url, 302);
  } catch (err) {
    const res = s3ErrorResponse(err);
    if (res) return res;
    throw err;
  }
});
