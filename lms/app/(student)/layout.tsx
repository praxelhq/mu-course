import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, requireUser, type SessionUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { WELCOME_COOKIE } from "@/lib/welcome";

export const dynamic = "force-dynamic";

// Authenticated shell for the student-facing routes (/dashboard, /sessions,
// …). Any signed-in user may view them; students who have not yet seen the
// onboarding note are sent to /welcome first (cookie-tracked — no schema
// change for a one-time flag).
export default async function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  let user: SessionUser;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  if (user.role === "student") {
    const store = await cookies();
    if (!store.get(WELCOME_COOKIE)?.value) redirect("/welcome");
  }

  return <Shell user={user}>{children}</Shell>;
}
