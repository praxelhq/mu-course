import { withAuth } from "@/lib/auth";
import { loadGradeLineForUser } from "@/lib/shipyard/grades";

// GET /api/shipyard/grades?userId=<id>
//   student        → their own grade line; naming another user is 403.
//   instructor/admin → may pass ?userId= for the drill-down.
//   200 { gradeLine } — `gradeLine` is null only when that student has no
//       product yet. A student WITH a product and no computed grade gets the
//       empty line (four labelled components, no numbers), because how the
//       course is scored is something they should be able to read in week one.
//
// Read-only, and it never computes: a grade is written by the review and gate
// hooks and by the admin recompute, never by a student loading a page.

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const url = new URL(req.url);
  const requested = url.searchParams.get("userId");
  const staff = user.role === "instructor" || user.role === "admin";

  if (requested && requested !== user.userId && !staff) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const targetUserId = requested && staff ? requested : user.userId;

  const gradeLine = await loadGradeLineForUser(targetUserId);
  return Response.json({ userId: targetUserId, gradeLine });
});
