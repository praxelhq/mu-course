import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth";

// Mark notifications read. Plain HTML form POST from the dashboard (no
// client JS): `id` marks one notification, no `id` marks all of mine.
// Scoped to the session user — you can never touch anyone else's rows.

export const POST = withAuth(async (req, { user }) => {
  const form = await req.formData().catch(() => null);
  const id = form?.get("id");

  await prisma.notification.updateMany({
    where: {
      userId: user.userId,
      readAt: null,
      ...(typeof id === "string" && id ? { id } : {}),
    },
    data: { readAt: new Date() },
  });

  const redirectTo = form?.get("redirectTo");
  // Only a single-leading-slash same-origin path is honored. Reject
  // protocol-relative ("//host") and backslash ("/\host") forms, which would
  // otherwise resolve to an off-site origin (open redirect).
  const dest =
    typeof redirectTo === "string" && /^\/(?![/\\])/.test(redirectTo)
      ? redirectTo
      : "/dashboard";

  // RELATIVE Location on purpose. Resolving against req.url would leak the
  // container's internal address — behind Railway that is http://0.0.0.0:8080,
  // so the browser was sent to a host it cannot reach. A relative path is
  // resolved by the browser against the address bar (the real public origin),
  // and it keeps the same-origin guarantee the check above establishes.
  return new Response(null, { status: 303, headers: { Location: dest } });
});
