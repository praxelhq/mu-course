import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const root = path.resolve("tmp/pdfs/session2-presentations");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION ?? process.env.AWS_REGION;

if (!bucket || !region) throw new Error("Missing S3_BUCKET or S3 region");

const client = new S3Client({ region, maxAttempts: 4 });
const queue = [...manifest];
const results = [];

async function bodyToBuffer(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function worker() {
  while (queue.length) {
    const row = queue.shift();
    const key = Array.isArray(row.files) ? row.files.find((value) => typeof value === "string") : null;
    const section = row.user?.section?.code ?? "unknown";
    const targetDir = path.join(root, "pdfs", section);
    const targetPath = path.join(targetDir, `${row.id}.pdf`);
    try {
      if (!key) throw new Error("No submitted file key");
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await bodyToBuffer(response.Body);
      if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error(`Not a PDF (${bytes.length} bytes)`);
      }
      await mkdir(targetDir, { recursive: true });
      await writeFile(targetPath, bytes);
      results.push({ ...row, s3Key: key, localPath: targetPath, bytes: bytes.length, downloadError: null });
    } catch (error) {
      results.push({ ...row, s3Key: key, localPath: null, bytes: 0, downloadError: String(error?.message ?? error) });
    }
    if (results.length % 25 === 0) console.log(`Downloaded ${results.length}/${manifest.length}`);
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));
results.sort((a, b) => a.user.email.localeCompare(b.user.email));
await writeFile(path.join(root, "downloaded.json"), JSON.stringify(results, null, 2));

const failures = results.filter((row) => row.downloadError);
console.log(JSON.stringify({ total: results.length, downloaded: results.length - failures.length, failures }, null, 2));
