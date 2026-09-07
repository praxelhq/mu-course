import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Vitest does not auto-load .env; Prisma loads it lazily but our guards check
// process.env.DATABASE_URL up front. Load it once here.
export function loadDotEnv(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(resolve(__dirname, "../../.env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // no .env — DB-dependent tests will self-skip
  }
}
