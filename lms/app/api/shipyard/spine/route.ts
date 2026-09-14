import { withAuth } from "@/lib/auth";
import { ensureProduct } from "@/lib/shipyard/products";
import { loadSpine, spineVersion } from "@/lib/shipyard/spine";

// The whole student spine, in one payload.
// GET /api/shipyard/spine?ifVersion=<hash>&userId=<id>
//   students        → always their own product; naming another user is 403.
//   instructor/admin → may pass ?userId= for the drill-down.
// Response: { version, spine } or { unchanged: true, version } when the hash
// matches, so the 4s poll in components/shipyard/use-spine-poll costs one
// content hash rather than a page of JSON.
//
// A student's first GET creates their product and its six checkpoint states.
// That is a write inside a GET, deliberately: enrolment is the only signal we
// get, `ensureProduct` is idempotent, and the alternative is a student whose
// very first page load is an error.

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const url = new URL(req.url);
  const requested = url.searchParams.get("userId");
  const staff = user.role === "instructor" || user.role === "admin";

  if (requested && requested !== user.userId && !staff) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const targetUserId = requested && staff ? requested : user.userId;

  if (targetUserId === user.userId && user.role === "student") {
    await ensureProduct(user.userId);
  }

  const spine = await loadSpine(targetUserId);
  const version = spineVersion(spine);

  const ifVersion = url.searchParams.get("ifVersion");
  if (ifVersion && ifVersion === version) {
    return Response.json({ unchanged: true, version });
  }
  return Response.json({ version, spine });
});
