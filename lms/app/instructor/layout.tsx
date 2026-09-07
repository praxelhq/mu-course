import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AuthError, requireRole, type SessionUser } from "@/lib/auth";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

// Instructor routes: instructors and admins pass (requireRole('instructor')
// admits both). No session → sign-in; wrong role → role home via "/".
export default async function InstructorLayout({
  children,
}: {
  children: ReactNode;
}) {
  let user: SessionUser;
  try {
    user = await requireRole("instructor");
  } catch (e) {
    if (e instanceof AuthError) redirect(e.status === 401 ? "/sign-in" : "/");
    throw e;
  }
  return <Shell user={user}>{children}</Shell>;
}
