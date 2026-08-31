import { PrismaClient } from "./generated/prisma/client";

// One client per process. Next's dev server reloads modules, so it is stashed
// on globalThis to avoid exhausting Postgres connections on every save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/// The app is designed to run without a database — a student mid-game keeps
/// playing on their own laptop if Postgres is unreachable. Callers check this
/// rather than throwing.
export const hasDatabase = Boolean(process.env.DATABASE_URL);
