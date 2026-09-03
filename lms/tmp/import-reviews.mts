import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { parseAppReviewCsv } from "@/lib/app-reviews/import";
import { importAppReviewEntries } from "@/lib/app-reviews/service";

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_PUBLIC_URL! } } });
const actor = await prisma.user.findFirst({ where: { role: { in: ["instructor", "admin"] } }, select: { id: true, email: true, role: true } });
if (!actor) { console.log("no instructor/admin user found"); process.exit(1); }
console.log(`  actor: ${actor.email} (${actor.role})`);

const rows = parseAppReviewCsv(readFileSync("tmp/app-reviews.csv", "utf8"));
console.log(`  csv rows: ${rows.length}`);

const apply = process.argv.includes("--apply");
const res = await importAppReviewEntries(rows, actor.id, apply, prisma as never);
console.log(`  mode: ${apply ? "APPLY" : "preview"}`);
const r = res as { added: number; unchanged: number; errors: { row: number; reason: string }[] };
console.log(`  added=${r.added} unchanged=${r.unchanged} errors=${r.errors.length}`);
const byReason = new Map<string, string[]>();
for (const e of r.errors) {
  const row = rows[e.row - 1];
  const who = row ? `${row.email} (${row.section})` : `row ${e.row}`;
  byReason.set(e.reason, [...(byReason.get(e.reason) ?? []), who]);
}
for (const [reason, who] of byReason) {
  console.log(`\n  ── ${who.length}x ${reason}`);
  for (const w of who) console.log(`       ${w}`);
}
process.exit(0);
