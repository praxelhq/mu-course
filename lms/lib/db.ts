import { PrismaClient } from "@prisma/client";

// Singleton Prisma client (survives dev hot reloads via globalThis).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
