import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AuthError, requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Faculty routes: instructors and admins pass (requireRole('instructor')
// admits both). No session → sign-in; a student who followed a link → their own
// spine, which is the only Shipyard page that is theirs.
//
// The chrome is the Shipyard shell one level up; this layout is the gate only.

export default async function ShipyardInstructorLayout({ children }: { children: ReactNode }) {
  try {
    await requireRole("instructor");
  } catch (e) {
    if (e instanceof AuthError) redirect(e.status === 401 ? "/sign-in" : "/shipyard");
    throw e;
  }
  return <>{children}</>;
}
