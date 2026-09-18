import { prisma } from "@/lib/db";
import { getClerkSession, getVerifiedClerkIdentity } from "@/lib/auth/clerk";
import { getSessionUser, isTestLoginEnabled } from "@/lib/auth";
import { allowedEmail } from "./contracts";

export class StudioError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function studioActor(req?: Request) {
  let identity: { clerkId: string; email: string; name: string } | null = null;
  let staff = false;
  if (isTestLoginEnabled()) {
    const user = await getSessionUser(req);
    if (user) {
      identity = {
        clerkId: `test:${user.userId}`,
        email: user.email.toLowerCase(),
        name: user.email.split("@")[0],
      };
      staff = user.role === "admin" || user.role === "instructor";
    }
  }
  if (!identity) {
    const session = await getClerkSession();
    if (!session)
      throw new StudioError(401, "Sign in with your MU email to continue.");
    identity = await getVerifiedClerkIdentity(session.clerkUserId);
    if (!identity)
      throw new StudioError(
        403,
        "Verify your primary email address before continuing.",
      );
    const roster = await prisma.user.findFirst({
      where: { email: { equals: identity.email, mode: "insensitive" } },
      select: { role: true },
    });
    staff = roster?.role === "admin" || roster?.role === "instructor";
    const instructors = (
      process.env.SHIPYARD_INSTRUCTOR_EMAILS || "build@praxel.in"
    )
      .toLowerCase()
      .split(",")
      .map((s) => s.trim());
    staff ||= instructors.includes(identity.email);
  }
  if (!staff && !allowedEmail(identity.email))
    throw new StudioError(
      403,
      "Use your Masters’ Union email address for Shipyard.",
    );
  // Never relink by email: only the verified Clerk identity can update its row.
  const row = await prisma.shipyardStudioIdentity.upsert({
    where: { clerkId: identity.clerkId },
    create: identity,
    update: { email: identity.email, name: identity.name },
  });
  return { ...row, staff };
}
export type StudioActor = Awaited<ReturnType<typeof studioActor>>;
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set([
    new URL(req.url).origin,
    ...(process.env.APP_URL ? [new URL(process.env.APP_URL).origin] : []),
  ]);
  if (!origin || !allowed.has(origin))
    throw new StudioError(
      403,
      "This action must come from your Shipyard workspace.",
    );
}
