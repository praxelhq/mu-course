import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("tmp/pdfs/session2-presentations");
const rows = JSON.parse(await readFile(path.join(root, "downloaded.json"), "utf8"));
const metadata = JSON.parse(await readFile(path.join(root, "pdf-metadata.json"), "utf8"));
const polished = await readFile(path.join(root, "polished-comments.json"), "utf8").then(JSON.parse).catch(() => ({}));

const wordCount = (value) => String(value || "").trim().split(/\s+/).filter(Boolean).length;
const hashFile = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");

const combined = [];
for (const row of rows) {
  const gradePath = path.join(root, "grades", `${row.id}.json`);
  const grade = await readFile(gradePath, "utf8").then(JSON.parse).catch(() => null);
  if (!grade?.scores) continue;
  const auditPath = path.join(root, "audits", `${row.id}.json`);
  const audit = await readFile(auditPath, "utf8").then(JSON.parse).catch(() => null);
  const auditedGrade = audit?.scores ? { ...grade, ...audit, first_pass: grade } : grade;
  const comment = polished[row.id];
  const effectiveGrade = comment ? {
    ...auditedGrade,
    what_worked: comment.what_worked,
    fix_next: comment.fix_next,
    verdict: comment.verdict,
  } : auditedGrade;
  combined.push({
    submissionId: row.id,
    name: row.user?.name || "",
    email: row.user?.email || "",
    section: row.user?.section?.code || "",
    title: row.fields?.title || "",
    submittedAt: row.submittedAt,
    pages: metadata[row.id]?.pages || grade.slide_count,
    pdfHash: await hashFile(row.localPath),
    ...effectiveGrade,
  });
}

const byHash = Map.groupBy(combined, (row) => row.pdfHash);
const duplicateGroups = [...byHash.values()].filter((group) => group.length > 1);
for (const group of duplicateGroups) {
  const canonical = group.toSorted((a, b) => a.submissionId.localeCompare(b.submissionId))[0];
  for (const row of group) {
    row.scores = structuredClone(canonical.scores);
    row.total = canonical.total;
    row.what_worked = canonical.what_worked;
    row.fix_next = canonical.fix_next;
    row.verdict = canonical.verdict;
    row.factual_error_count = canonical.factual_error_count;
    row.factual_error_detail = canonical.factual_error_detail;
    row.evidence = structuredClone(canonical.evidence);
    row.flags = [...new Set([...(canonical.flags || []), "exact-file-duplicate"])];
  }
}

combined.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

const totals = combined.map((row) => row.total).sort((a, b) => a - b);
const quantile = (p) => totals.length ? totals[Math.min(totals.length - 1, Math.floor((totals.length - 1) * p))] : null;
const sectionStats = Object.fromEntries([...Map.groupBy(combined, (row) => row.section)].map(([section, group]) => [section, {
  count: group.length,
  mean: Number((group.reduce((sum, row) => sum + row.total, 0) / group.length).toFixed(2)),
  min: Math.min(...group.map((row) => row.total)),
  max: Math.max(...group.map((row) => row.total)),
}]));
const qa = {
  expected: rows.length,
  complete: combined.length,
  missing: rows.filter((row) => !combined.some((grade) => grade.submissionId === row.id)).map((row) => row.id),
  total: { min: totals[0], q1: quantile(0.25), median: quantile(0.5), q3: quantile(0.75), max: totals.at(-1) },
  sectionStats,
  duplicateGroups: duplicateGroups.map((group) => group.map((row) => ({ submissionId: row.submissionId, name: row.name, email: row.email }))),
  commentViolations: combined.filter((row) => wordCount(row.what_worked) > 18 || wordCount(row.fix_next) > 24 || wordCount(row.verdict) > 16).map((row) => ({
    submissionId: row.submissionId,
    words: { what: wordCount(row.what_worked), fix: wordCount(row.fix_next), verdict: wordCount(row.verdict) },
  })),
  lowConfidence: combined.filter((row) => row.confidence !== "high").map((row) => row.submissionId),
};

await writeFile(path.join(root, "combined.json"), JSON.stringify(combined, null, 2));
await writeFile(path.join(root, "qa.json"), JSON.stringify(qa, null, 2));
process.stdout.write(`${JSON.stringify(qa, null, 2)}\n`);
