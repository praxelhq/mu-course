import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve("tmp/pdfs/session2-presentations");
const rows = JSON.parse(await readFile(path.join(root, "downloaded.json"), "utf8"));
const renderRoot = path.join(root, "renders");
const textRoot = path.join(root, "text");
const metadataPath = path.join(root, "pdf-metadata.json");
const existing = await readFile(metadataPath, "utf8").then(JSON.parse).catch(() => ({}));

async function inspect(row) {
  if (existing[row.id]?.rendered) return existing[row.id];
  const section = row.user?.section?.code || "Unknown";
  const renderDir = path.join(renderRoot, section, row.id);
  const textDir = path.join(textRoot, section);
  await mkdir(renderDir, { recursive: true });
  await mkdir(textDir, { recursive: true });
  const { stdout } = await execFileAsync("/opt/homebrew/bin/pdfinfo", [row.localPath], { maxBuffer: 4_000_000 });
  const pages = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
  const pageSize = stdout.match(/^Page size:\s+(.+)$/m)?.[1]?.trim() || "";
  await execFileAsync("/opt/homebrew/bin/pdftotext", ["-layout", row.localPath, path.join(textDir, `${row.id}.txt`)], { maxBuffer: 4_000_000 });
  await execFileAsync("/opt/homebrew/bin/pdftoppm", ["-jpeg", "-r", "72", "-jpegopt", "quality=78,progressive=y,optimize=y", row.localPath, path.join(renderDir, "slide")], { maxBuffer: 4_000_000 });
  return { pages, pageSize, rendered: true };
}

let cursor = 0;
const workers = Array.from({ length: 4 }, async () => {
  while (cursor < rows.length) {
    const row = rows[cursor++];
    try {
      existing[row.id] = await inspect(row);
    } catch (error) {
      existing[row.id] = { rendered: false, error: String(error?.message || error) };
    }
    if (cursor % 10 === 0 || cursor === rows.length) {
      await writeFile(metadataPath, JSON.stringify(existing, null, 2));
      process.stdout.write(`processed ${cursor}/${rows.length}\n`);
    }
  }
});

await Promise.all(workers);
await writeFile(metadataPath, JSON.stringify(existing, null, 2));
const failures = Object.values(existing).filter((x) => !x.rendered).length;
process.stdout.write(`done ${rows.length - failures}/${rows.length}; failures=${failures}\n`);
