import Anthropic from "@anthropic-ai/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("tmp/pdfs/session2-presentations");
const rows = JSON.parse(await readFile(path.join(root, "combined.json"), "utf8"));
const outDir = path.join(root, "comment-batches");
await mkdir(outDir, { recursive: true });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = process.env.COMMENT_MODEL || "claude-opus-4-6";
const batchSize = 20;

const SYSTEM = `Edit real university instructor comments. Make them crisp, plain-spoken, specific, and useful—not chatbot feedback.

For each opaque id, return exactly:
{"id":"...","what_worked":"...","fix_next":"...","verdict":"..."}

Rules:
- Preserve the assessment and facts supplied. Do not invent or soften material errors.
- what_worked: one specific observation, 5–16 words. If nothing substantive worked, state the narrow presentational positive honestly.
- fix_next: one highest-leverage action, imperative voice, 5–20 words.
- verdict: blunt but fair summary, 3–10 words.
- No semicolons. No multi-sentence fields. No score references.
- Avoid lazy AI phrases/openers: "strong", "clear", "well-structured", "compelling", "robust", "excellent", "good", "nice", "would benefit from", "overall".
- Sound like an instructor who read the deck and has limited time.

Return ONLY a JSON array in the same order as the input.`;

const words = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;
function extractArray(text) {
  const cleaned = text.replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("no JSON array");
  return JSON.parse(cleaned.slice(start, end + 1));
}
function validate(result, input) {
  if (!Array.isArray(result) || result.length !== input.length) throw new Error("wrong output length");
  const byId = new Map(result.map((row) => [row.id, row]));
  if (byId.size !== input.length) throw new Error("duplicate or missing ids");
  const ordered = input.map((row) => byId.get(row.id));
  for (let i = 0; i < input.length; i++) {
    const out = ordered[i];
    if (!out) throw new Error("id mismatch");
    for (const key of ["what_worked", "fix_next", "verdict"]) if (typeof out[key] !== "string" || !out[key].trim()) throw new Error(`missing ${key}`);
    if (words(out.what_worked) > 30 || words(out.fix_next) > 36 || words(out.verdict) > 20) throw new Error("word limit exceeded");
  }
  return ordered;
}

const batches = Array.from({ length: Math.ceil(rows.length / batchSize) }, (_, i) => rows.slice(i * batchSize, (i + 1) * batchSize));
async function processBatch(i) {
  const outPath = path.join(outDir, `${String(i).padStart(3, "0")}.json`);
  const prior = await readFile(outPath, "utf8").then(JSON.parse).catch(() => null);
  if (prior?.model === model && Array.isArray(prior.rows) && prior.rows.length === batches[i].length) {
    process.stdout.write(`polished ${i + 1}/${batches.length} (cached)\n`);
    return;
  }
  const input = batches[i].map((row) => ({
    id: row.submissionId,
    scores: row.scores,
    what_worked: row.what_worked,
    fix_next: row.fix_next,
    verdict: row.verdict,
    factual_error_detail: row.factual_error_detail,
    evidence: row.evidence,
  }));
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 5000,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: "user", content: `Rewrite these comments. Return only the JSON array.\n${JSON.stringify(input)}` }],
      });
      const text = res.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      const output = validate(extractArray(text), input);
      await writeFile(outPath, JSON.stringify({ model, rows: output }, null, 2));
      last = null;
      break;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 1200 * 2 ** attempt));
    }
  }
  if (last) throw last;
  process.stdout.write(`polished ${i + 1}/${batches.length}\n`);
}

let cursor = 0;
const workers = Array.from({ length: Number(process.env.COMMENT_CONCURRENCY || 3) }, async () => {
  while (cursor < batches.length) await processBatch(cursor++);
});
await Promise.all(workers);

const polished = {};
for (let i = 0; i < batches.length; i++) {
  const file = JSON.parse(await readFile(path.join(outDir, `${String(i).padStart(3, "0")}.json`), "utf8"));
  for (const row of file.rows) polished[row.id] = row;
}
await writeFile(path.join(root, "polished-comments.json"), JSON.stringify(polished, null, 2));
process.stdout.write(`done ${Object.keys(polished).length}/${rows.length}; model=${model}\n`);
