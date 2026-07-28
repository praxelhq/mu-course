// pg-boss worker entrypoint. Job handlers (grading queue, crawls) are
// registered here by later units.
import { PgBoss } from "pg-boss";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss(databaseUrl);
  boss.on("error", (err: Error) => console.error("[pg-boss]", err));
  try {
    await boss.start();
  } catch (err) {
    console.error(
      "[worker] Could not connect to Postgres at DATABASE_URL — exiting.",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  }
  console.log("Worker started. No handlers registered yet.");

  const shutdown = async () => {
    await boss.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
