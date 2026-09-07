import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AuthError, requireRole, type SessionUser } from "@/lib/auth";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

// Admin routes: admins only. The layout owns the redirect handling; pages
// underneath (e.g. admin/roster) may keep their own requireRole as defense
// in depth — it resolves the same way and never fires first for browsers.
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  let user: SessionUser;
  try {
    user = await requireRole("admin");
  } catch (e) {
    if (e instanceof AuthError) redirect(e.status === 401 ? "/sign-in" : "/");
    throw e;
  }
  return <Shell user={user}>{children}</Shell>;
}
