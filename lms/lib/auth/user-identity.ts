import type { PrismaClient, Role } from "@prisma/client";

const identityUserSelect = {
  id: true,
  email: true,
  role: true,
  sectionId: true,
  teamId: true,
} as const;

export type IdentityUser = {
  id: string;
  email: string;
  role: Role;
  sectionId: string | null;
  teamId: string | null;
};

/** Canonical email wins if bad data ever overlaps the two email namespaces. */
export async function findUserByEmailIdentity(
  db: PrismaClient,
  email: string,
): Promise<IdentityUser | null> {
  const normalized = email.trim().toLowerCase();
  const canonical = await db.user.findUnique({
    where: { email: normalized },
    select: identityUserSelect,
  });
  if (canonical) return canonical;

  const alias = await db.userEmailAlias.findUnique({
    where: { email: normalized },
    select: { user: { select: identityUserSelect } },
  });
  return alias?.user ?? null;
}

export async function findUserByClerkIdentity(
  db: PrismaClient,
  clerkUserId: string,
): Promise<IdentityUser | null> {
  const primary = await db.user.findUnique({
    where: { clerkUserId },
    select: identityUserSelect,
  });
  if (primary) return primary;

  const identity = await db.userClerkIdentity.findUnique({
    where: { clerkUserId },
    select: { user: { select: identityUserSelect } },
  });
  return identity?.user ?? null;
}

/** Persist an additional Clerk account without replacing the first account. */
export async function linkClerkIdentity(
  db: PrismaClient,
  userId: string,
  clerkUserId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.userClerkIdentity.createMany({
      data: [{ clerkUserId, userId }],
      skipDuplicates: true,
    });
    const existing = await tx.userClerkIdentity.findUnique({
      where: { clerkUserId },
      select: { userId: true },
    });
    if (!existing || existing.userId !== userId) {
      throw new Error("Clerk identity is already linked to another LMS user");
    }
    await tx.user.updateMany({
      where: { id: userId, clerkUserId: null },
      data: { clerkUserId },
    });
    await tx.user.update({
      where: { id: userId },
      data: { flaggedForDeletion: false },
    });
  });
}
