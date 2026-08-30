import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be supplied explicitly; this release command never falls back to lms/.env.",
  );
}
if (process.env.CONFIRM_DISPOSABLE_POSTGRES !== "1") {
  throw new Error(
    "Set CONFIRM_DISPOSABLE_POSTGRES=1 only after confirming DATABASE_URL targets an isolated disposable database.",
  );
}

const parsed = new URL(databaseUrl);
if (!/^postgres(?:ql)?:$/u.test(parsed.protocol)) {
  throw new Error("DATABASE_URL must use the postgresql:// or postgres:// protocol.");
}

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
      "tests/dpdp-erasure.pg.test.ts",
      "tests/review-queue-hold-resolution.pg.test.ts",
      "tests/sessions3-5-loader.test.ts",
      "tests/app-reviews.pg.test.ts",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUN_DPDP_ERASURE_PG_TESTS: "1",
      RUN_REVIEW_QUEUE_PG_TESTS: "1",
      RUN_APP_REVIEW_PG_TESTS: "1",
      U8_DISPOSABLE_DATABASE: "1",
    },
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
