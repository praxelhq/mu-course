import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
export const researchSources = ["market", "reddit", "x", "instagram"] as const;
export async function sourceEnabled(
  source: string,
  db: Prisma.TransactionClient = prisma,
) {
  const row = await db.configKV.findUnique({
    where: { key: `shipyard.studio.source.${source}` },
  });
  return row?.value !== false;
}
