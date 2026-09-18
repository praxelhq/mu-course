/** Import a private, normalized NDJSON export. Never commit the data file. */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { prisma } from "../lib/db";
import { z } from "zod";
const rowSchema = z.object({
  id: z.string(),
  source: z.enum(["AppSumo", "Acquire", "TrustMRR"]),
  title: z.string(),
  url: z.url(),
  capturedAt: z.iso.datetime({ offset: true }),
  text: z.string(),
  data: z.record(z.string(), z.unknown()),
});
async function main() {
  const file = process.argv[2];
  if (!file)
    throw new Error(
      "Usage: tsx scripts/shipyard-studio-import.ts /private/path/knowledge.ndjson",
    );
  let count = 0;
  const counts: Record<string, number> = {};
  for await (const line of createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  })) {
    if (!line.trim()) continue;
    const row = rowSchema.parse(JSON.parse(line));
    const data = {
      source: row.source,
      title: row.title,
      url: row.url,
      capturedAt: new Date(row.capturedAt),
      text: row.text,
      data: JSON.parse(JSON.stringify(row.data)),
    };
    await prisma.shipyardStudioKnowledge.upsert({
      where: { id: row.id },
      create: { id: row.id, ...data },
      update: data,
    });
    counts[row.source] = (counts[row.source] || 0) + 1;
    count++;
  }
  const stored = await prisma.shipyardStudioKnowledge.groupBy({
    by: ["source"], where: { source: { in: ["TrustMRR", "Acquire", "AppSumo"] } }, _count: true,
  });
  console.log(JSON.stringify({ processedRows: count, inputSources: counts, storedSources: Object.fromEntries(stored.map(s => [s.source, s._count])) }));
}
main()
  .catch(() => {
    console.error(
      "Knowledge import failed. Check the source schema and database connection.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
