import { Prisma, type PrismaClient } from "@prisma/client";
import type { DatabaseReadiness } from "./readiness";

export type DatabaseReadinessDeps = {
  listAppliedMigrations(): Promise<string[]>;
  countFailedMigrations(): Promise<number>;
};

export async function inspectDatabaseReadiness(
  deps: DatabaseReadinessDeps,
): Promise<DatabaseReadiness> {
  try {
    const [applied, failedMigrationCount] = await Promise.all([
      deps.listAppliedMigrations(),
      deps.countFailedMigrations(),
    ]);
    const normalized = applied
      .filter((migration): migration is string => typeof migration === "string")
      .sort();
    return {
      reachable: true,
      appliedHead: normalized.at(-1) ?? null,
      failedMigrationCount,
    };
  } catch {
    return { reachable: false, appliedHead: null, failedMigrationCount: null };
  }
}

/** Query Prisma's own migration ledger; no application table can spoof it. */
export function inspectPrismaDatabaseReadiness(
  db: Pick<PrismaClient, "$queryRaw">,
): Promise<DatabaseReadiness> {
  return inspectDatabaseReadiness({
    listAppliedMigrations: async () => {
      const rows = await db.$queryRaw<{ migration_name: string }[]>(
        Prisma.sql`
          SELECT migration_name
          FROM "_prisma_migrations"
          WHERE finished_at IS NOT NULL
            AND rolled_back_at IS NULL
          ORDER BY migration_name ASC
        `,
      );
      return rows.map((row) => row.migration_name);
    },
    countFailedMigrations: async () => {
      const rows = await db.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM "_prisma_migrations"
          WHERE finished_at IS NULL
            AND rolled_back_at IS NULL
        `,
      );
      return Number(rows[0]?.count ?? BigInt(0));
    },
  });
}
