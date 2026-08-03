import { cache } from "react";
import { prisma } from "@/lib/db";

export function hasClerkKeys(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export type SessionIdentity = { clerkUserId: string; email?: string | null };

export const getSessionIdentity = cache(async (): Promise<SessionIdentity | null> => {
  if (hasClerkKeys()) {
    const { auth, currentUser } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    return { clerkUserId: userId, email: user?.primaryEmailAddress?.emailAddress ?? null };
  }
  if (process.env.NODE_ENV !== "production" && process.env.FIXTURE_MODE === "true") {
    return { clerkUserId: "fixture-user", email: "builder@example.test" };
  }
  return null;
});

export async function requireSessionIdentity(): Promise<SessionIdentity> {
  const identity = await getSessionIdentity();
  if (!identity) throw new Error("UNAUTHENTICATED");
  return identity;
}

export async function ensureUser(identity: SessionIdentity) {
  return prisma.user.upsert({
    where: { clerkUserId: identity.clerkUserId },
    update: { email: identity.email ?? undefined },
    create: { clerkUserId: identity.clerkUserId, email: identity.email ?? undefined },
  });
}

export function authErrorResponse(error: unknown): Response | null {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") return Response.json({ error: "Sign in to continue." }, { status: 401 });
  return null;
}
