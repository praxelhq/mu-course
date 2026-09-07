import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";

// Full-bleed layout for the interview itself. Deliberately does NOT render the
// student Shell: a timed, recorded, graded conversation gets the whole screen,
// with no nav to wander into and no content column to be squeezed by.
// Authentication still applies.

export const dynamic = "force-dynamic";

export default async function RoomLayout({ children }: { children: ReactNode }) {
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }
  return <>{children}</>;
}
