// PRODUCTION bootstrap — real cohort, no demo fixtures.
//
// Idempotent and submission-safe: creates the 8 real sections, the 10 session
// pages, imports the real student roster from a CSV, and provisions staff
// accounts. Re-running it updates names/sections and adds new students; it
// never deletes submissions, votes or grades.
//
//   DATABASE_URL=... pnpm tsx scripts/prod-bootstrap.ts <roster.csv>
//
// Run the relevant per-session loader afterwards. Bootstrap owns only the
// roster and missing shell pages; it never rewrites authored session content
// or gate state.

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseRosterCsv } from "../lib/roster-csv";

const prisma = new PrismaClient();

const SECTION_CODES = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

/** Staff accounts that must exist regardless of the student roster. */
const STAFF = [
  { email: "build@praxel.in", name: "Praxel Build", role: "admin" as const },
];

const SESSION_PAGES: { n: number; title: string; summary: string }[] = [
  { n: 1, title: "Kickoff: The Heist, teams & sectors", summary: "The Heist simulation, team formation, and the sector claim." },
  { n: 2, title: "AI basics: prompting, skills & models", summary: "Research with AI, COSTAR prompting, the SCENE image framework, and model comparison. Ship today's artifacts below." },
  { n: 3, title: "Working with data using AI", summary: "Two datasets, five labs." },
  { n: 4, title: "Build an app with Lovable", summary: "Build and ship a working app for your team's industry." },
  { n: 5, title: "Automation with Make.com", summary: "One automation per member, mapped to a real process." },
  { n: 6, title: "Multimedia + mid-course map checkpoint", summary: "Multimedia, then checkpoint presentations of the value chain maps." },
  { n: 7, title: "RAG, custom models & keeping up", summary: "Retrieval-augmented generation, fine-tuning, and keeping up." },
  { n: 8, title: "MCPs, AI evals & operating AI-first", summary: "Model Context Protocol, evaluating AI systems, operating AI-first." },
  { n: 9, title: "Value chain map — build", summary: "Building the capstone map." },
  { n: 10, title: "Final presentations", summary: "The capstone map, presentable to a stranger." },
];

export async function ensureMissingSessionPages(
  db: Pick<PrismaClient, "sessionPage">,
): Promise<void> {
  for (const page of SESSION_PAGES) {
    await db.sessionPage.upsert({
      where: { sessionNo: page.n },
      create: { sessionNo: page.n, title: page.title, summaryMd: page.summary },
      update: {},
    });
  }
}

export async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error("usage: prod-bootstrap.ts <roster.csv>");

  // 1) Sections A–H.
  for (const code of SECTION_CODES) {
    await prisma.section.upsert({
      where: { code },
      create: { code, name: `Section ${code}` },
      update: {},
    });
  }
  const sections = await prisma.section.findMany({ select: { id: true, code: true } });
  const sectionIdByCode = new Map(sections.map((s) => [s.code, s.id]));
  console.log(`[prod] sections: ${sections.length}`);

  // 2) Missing Session pages 1–10. Existing authored pages belong to their
  // per-session release and must survive a roster/bootstrap rerun unchanged.
  await ensureMissingSessionPages(prisma);
  console.log(`[prod] session pages: ${SESSION_PAGES.length}`);

  // 3) Staff.
  for (const s of STAFF) {
    await prisma.user.upsert({
      where: { email: s.email },
      create: { email: s.email, name: s.name, role: s.role },
      update: { role: s.role, name: s.name },
    });
    console.log(`[prod] staff: ${s.email} (${s.role})`);
  }

  // 4) Students from the roster CSV.
  const parsed = parseRosterCsv(readFileSync(csvPath, "utf8"), [...SECTION_CODES]);
  if (parsed.invalid.length > 0) {
    console.log(`[prod] skipping ${parsed.invalid.length} invalid rows, e.g.:`);
    for (const r of parsed.invalid.slice(0, 5)) console.log(`   line ${r.line}: ${r.reason}`);
  }

  // Batched: one read of existing emails, one bulk insert, updates only where
  // something actually changed — 459 sequential round-trips over the public
  // proxy is far too slow.
  const emails = parsed.rows.map((r) => r.email);
  const existing = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true, name: true, sectionId: true },
  });
  const existingByEmail = new Map(existing.map((u) => [u.email, u]));

  const toCreate: { email: string; name: string; role: "student"; sectionId: string }[] = [];
  const toUpdate: { email: string; name: string; sectionId: string }[] = [];
  for (const row of parsed.rows) {
    const sectionId = sectionIdByCode.get(row.section);
    if (!sectionId) continue;
    const prev = existingByEmail.get(row.email);
    if (!prev) {
      toCreate.push({ email: row.email, name: row.name, role: "student", sectionId });
    } else if (prev.name !== row.name || prev.sectionId !== sectionId) {
      toUpdate.push({ email: row.email, name: row.name, sectionId });
    }
  }

  if (toCreate.length > 0) {
    await prisma.user.createMany({ data: toCreate, skipDuplicates: true });
  }
  for (const u of toUpdate) {
    await prisma.user.update({ where: { email: u.email }, data: { name: u.name, sectionId: u.sectionId } });
  }
  console.log(
    `[prod] students: ${toCreate.length} created, ${toUpdate.length} updated, ` +
      `${parsed.rows.length - toCreate.length - toUpdate.length} unchanged (roster rows: ${parsed.rows.length})`,
  );

  // 5) Summary by section.
  const bySection = await prisma.user.groupBy({
    by: ["sectionId"],
    where: { role: "student" },
    _count: { _all: true },
  });
  const codeById = new Map(sections.map((s) => [s.id, s.code]));
  const summary = bySection
    .map((r) => `${codeById.get(r.sectionId ?? "") ?? "?"}:${r._count._all}`)
    .sort()
    .join(" ");
  console.log(`[prod] per-section student counts -> ${summary}`);
  console.log("[prod] bootstrap complete");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/prod-bootstrap.ts")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
