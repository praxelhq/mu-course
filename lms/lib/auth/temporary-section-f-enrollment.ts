import { Prisma, type PrismaClient, type Role } from "@prisma/client";

const MAX_WINDOW_MS = 30 * 60 * 1000;

type EnrollmentEnv = {
  TEMPORARY_SECTION_ENROLLMENT_CODE?: string;
  TEMPORARY_SECTION_ENROLLMENT_UNTIL?: string;
  TEMPORARY_SECTION_F_ENROLLMENT_UNTIL?: string;
};

type EnrolledUser = {
  id: string;
  role: Role;
  sectionId: string | null;
};

export type TemporaryEnrollmentDeps = {
  findSectionF: (sectionCode: string) => Promise<{ id: string } | null>;
  createUser: (data: {
    email: string;
    name: string;
    sectionId: string;
    clerkUserId: string;
  }) => Promise<EnrolledUser | null>;
  claimExistingSectionFStudent: (data: {
    email: string;
    sectionId: string;
    clerkUserId: string;
  }) => Promise<EnrolledUser | null>;
  createAuditLog: (data: {
    userId: string;
    email: string;
    expiresAt: string;
  }) => Promise<void>;
};

export function isTemporarySectionFEnrollmentOpen(
  env: EnrollmentEnv = {
    TEMPORARY_SECTION_ENROLLMENT_CODE:
      process.env.TEMPORARY_SECTION_ENROLLMENT_CODE,
    TEMPORARY_SECTION_ENROLLMENT_UNTIL:
      process.env.TEMPORARY_SECTION_ENROLLMENT_UNTIL,
    TEMPORARY_SECTION_F_ENROLLMENT_UNTIL:
      process.env.TEMPORARY_SECTION_F_ENROLLMENT_UNTIL,
  },
  now = new Date(),
): boolean {
  const raw =
    env.TEMPORARY_SECTION_ENROLLMENT_UNTIL ??
    env.TEMPORARY_SECTION_F_ENROLLMENT_UNTIL;
  if (!raw) return false;
  if (!temporaryEnrollmentSectionCode(env)) return false;

  const expiresAt = Date.parse(raw);
  if (!Number.isFinite(expiresAt)) return false;

  const remainingMs = expiresAt - now.getTime();
  return remainingMs > 0 && remainingMs <= MAX_WINDOW_MS;
}

export function temporaryEnrollmentSectionCode(
  env: EnrollmentEnv = {
    TEMPORARY_SECTION_ENROLLMENT_CODE:
      process.env.TEMPORARY_SECTION_ENROLLMENT_CODE,
    TEMPORARY_SECTION_ENROLLMENT_UNTIL:
      process.env.TEMPORARY_SECTION_ENROLLMENT_UNTIL,
    TEMPORARY_SECTION_F_ENROLLMENT_UNTIL:
      process.env.TEMPORARY_SECTION_F_ENROLLMENT_UNTIL,
  },
): string | null {
  if (env.TEMPORARY_SECTION_ENROLLMENT_UNTIL) {
    const code = env.TEMPORARY_SECTION_ENROLLMENT_CODE?.trim().toUpperCase();
    return code && /^[A-Z]$/.test(code) ? code : null;
  }
  return env.TEMPORARY_SECTION_F_ENROLLMENT_UNTIL ? "F" : null;
}

export function temporaryEnrollmentName(email: string): string {
  const localPart = email.split("@", 1)[0] ?? "Student";
  const name = localPart.replace(/[^a-z0-9]+/gi, " ").trim();
  return name || "Student";
}

export async function enrollTemporarySectionFUser(
  args: {
    email: string;
    clerkUserId: string;
    env?: EnrollmentEnv;
    now?: () => Date;
  },
  deps: TemporaryEnrollmentDeps,
): Promise<EnrolledUser | null> {
  const now = args.now ?? (() => new Date());
  if (!isTemporarySectionFEnrollmentOpen(args.env, now())) return null;

  const sectionCode = temporaryEnrollmentSectionCode(args.env);
  if (!sectionCode) return null;
  const section = await deps.findSectionF(sectionCode);
  if (!section) {
    throw new Error(`Temporary Section ${sectionCode} enrollment is unavailable`);
  }

  // Do not persist a user when the window expired during the section lookup.
  if (!isTemporarySectionFEnrollmentOpen(args.env, now())) return null;

  const email = args.email.toLowerCase();
  const enrollmentData = { email, sectionId: section.id, clerkUserId: args.clerkUserId };
  const user =
    (await deps.createUser({
      ...enrollmentData,
      name: temporaryEnrollmentName(email),
    })) ?? (await deps.claimExistingSectionFStudent(enrollmentData));

  if (!user) return null;

  try {
    await deps.createAuditLog({
      userId: user.id,
      email,
      expiresAt:
        args.env?.TEMPORARY_SECTION_ENROLLMENT_UNTIL ??
        args.env?.TEMPORARY_SECTION_F_ENROLLMENT_UNTIL ??
        process.env.TEMPORARY_SECTION_ENROLLMENT_UNTIL ??
        process.env.TEMPORARY_SECTION_F_ENROLLMENT_UNTIL ??
        "",
    });
  } catch {
    // Enrollment is authoritative; audit availability must not block class.
  }
  return user;
}

export function prismaTemporaryEnrollmentDeps(
  db: PrismaClient,
): TemporaryEnrollmentDeps {
  const userSelect = { id: true, role: true, sectionId: true } as const;
  return {
    findSectionF: (sectionCode) =>
      db.section.findUnique({ where: { code: sectionCode }, select: { id: true } }),
    createUser: async (data) => {
      try {
        return await db.user.create({
          data: {
            email: data.email,
            name: data.name,
            role: "student",
            sectionId: data.sectionId,
            clerkUserId: data.clerkUserId,
          },
          select: userSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return null;
        }
        throw error;
      }
    },
    claimExistingSectionFStudent: async ({ email, sectionId, clerkUserId }) => {
      const claimed = await db.user.updateMany({
        where: {
          email,
          role: "student",
          sectionId,
          OR: [{ clerkUserId: null }, { clerkUserId }],
        },
        data: { clerkUserId, flaggedForDeletion: false },
      });
      if (claimed.count !== 1) return null;
      return db.user.findUnique({ where: { email }, select: userSelect });
    },
    createAuditLog: async ({ userId, email, expiresAt }) => {
      const sectionCode = temporaryEnrollmentSectionCode() ?? "unknown";
      await db.auditLog.create({
        data: {
          action: "auth.temporary_section_enrollment",
          targetType: "user",
          targetId: userId,
          after: { email, sectionCode, source: "auth", expiresAt },
        },
      });
    },
  };
}
