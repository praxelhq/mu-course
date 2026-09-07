import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { updateClerkUserMetadata } from "@/lib/auth/clerk";

export class InstructorRosterError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) {
    super(message);
    this.name = "InstructorRosterError";
  }
}

function displayName(email: string) {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function assignStudentSection(input: {
  actorId: string;
  email: string;
  sectionCode: string;
}) {
  const email = input.email.trim().toLowerCase();
  const sectionCode = input.sectionCode.trim().toUpperCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new InstructorRosterError("Enter a valid email address.");
  if (!/^[A-H]$/.test(sectionCode)) throw new InstructorRosterError("Choose a valid section.");

  const result = await prisma.$transaction(async (tx) => {
    const section = await tx.section.findUnique({ where: { code: sectionCode } });
    if (!section) throw new InstructorRosterError("That section does not exist.");
    const canonical = await tx.user.findUnique({
      where: { email },
      include: { clerkIdentities: { select: { clerkUserId: true } }, section: { select: { code: true } } },
    });
    const alias = canonical
      ? null
      : await tx.userEmailAlias.findUnique({
          where: { email },
          include: {
            user: {
              include: { clerkIdentities: { select: { clerkUserId: true } }, section: { select: { code: true } } },
            },
          },
        });
    const existing = canonical ?? alias?.user ?? null;
    if (existing && existing.role !== "student") {
      throw new InstructorRosterError("Instructor and admin accounts cannot be reassigned here.", 409);
    }

    if (!existing) {
      const created = await tx.user.create({
        data: { email, name: displayName(email), role: "student", sectionId: section.id },
        include: { clerkIdentities: { select: { clerkUserId: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "roster.student_created",
          targetType: "User",
          targetId: created.id,
          after: { matchedEmail: email, sectionCode },
        },
      });
      return { status: "created" as const, user: created, sectionId: section.id };
    }

    if (existing.sectionId === section.id) {
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "roster.student_assignment_confirmed",
          targetType: "User",
          targetId: existing.id,
          after: { matchedEmail: email, sectionCode, match: canonical ? "canonical" : "alias" },
        },
      });
      return { status: "unchanged" as const, user: existing, sectionId: section.id };
    }

    const changed = await tx.user.updateMany({
      where: { id: existing.id, role: "student" },
      data: { sectionId: section.id, teamId: null, flaggedForDeletion: false },
    });
    if (changed.count !== 1) throw new InstructorRosterError("This account changed and was not reassigned.", 409);
    const updated = await tx.user.findUniqueOrThrow({
      where: { id: existing.id },
      include: { clerkIdentities: { select: { clerkUserId: true } } },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "roster.student_reassigned",
        targetType: "User",
        targetId: existing.id,
        before: { sectionCode: existing.section?.code ?? null, teamId: existing.teamId },
        after: { matchedEmail: email, sectionCode, teamId: null, match: canonical ? "canonical" : "alias" },
      },
    });
    return { status: "reassigned" as const, user: updated, sectionId: section.id };
  }).catch(async (error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new InstructorRosterError("That email is already linked to another LMS account.", 409);
    }
    throw error;
  });

  const clerkIds = new Set([
    ...(result.user.clerkUserId ? [result.user.clerkUserId] : []),
    ...result.user.clerkIdentities.map((identity) => identity.clerkUserId),
  ]);
  const syncResults = await Promise.allSettled(
    [...clerkIds].map((clerkUserId) =>
      updateClerkUserMetadata(clerkUserId, {
        publicMetadata: { role: "student", sectionId: result.sectionId },
        privateMetadata: { flaggedForDeletion: false },
      }),
    ),
  );
  const failedSyncs = syncResults.filter((item) => item.status === "rejected").length;
  if (failedSyncs > 0) {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "roster.clerk_metadata_sync_pending",
        targetType: "User",
        targetId: result.user.id,
        after: { failedSyncs, sectionCode },
      },
    }).catch(() => undefined);
  }
  return { status: result.status, email: result.user.email, name: result.user.name, sectionCode, metadataSyncPending: failedSyncs > 0 };
}
