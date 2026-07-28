/* eslint-disable @typescript-eslint/no-require-imports */
// Demo-only boot seeder. Runs the deterministic demo seed (prisma/seed.ts via
// tsx) ONLY when the database has no users, so a routine container restart
// never wipes a demo session's activity. First boot on a fresh DB seeds the
// full demo world; subsequent boots are a no-op. Never fails the boot: a seed
// error is logged and the server starts anyway.
const { PrismaClient } = require("@prisma/client");
const { execSync } = require("node:child_process");

(async () => {
  const prisma = new PrismaClient();
  let count = 0;
  try {
    count = await prisma.user.count();
  } catch {
    count = 0; // table may not exist yet on a brand-new DB
  } finally {
    await prisma.$disconnect();
  }

  if (count > 0) {
    console.log(`[demo] database already seeded (${count} users) - skipping`);
    return;
  }

  console.log("[demo] empty database - seeding demo world...");
  execSync("tsx prisma/seed.ts", { stdio: "inherit" });
})().catch((err) => {
  console.error("[demo] seed step failed (starting server anyway):", err?.message ?? err);
});
