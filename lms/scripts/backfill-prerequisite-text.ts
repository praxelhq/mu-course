// Re-run prerequisite preparation for every artifact still sitting with no
// extracted text. Uses the real worker handler, so what happens here is
// exactly what happens in production — including the vision path that reads a
// sector map drawn as a picture.
//
//   pnpm prereq:backfill            # report only
//   pnpm prereq:backfill --write    # actually prepare them
//
// Writes are guarded on the row still being empty, so a student who
// re-uploaded mid-run is never overwritten.
import { PrismaClient } from "@prisma/client";
import { handlePreparePrerequisite } from "../worker/jobs/prepare-prerequisite";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const rows = await prisma.interviewPrerequisite.findMany({
    where: { OR: [{ extractedText: null }, { extractedText: "" }] },
    select: {
      userId: true,
      kind: true,
      contentType: true,
      sizeBytes: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${rows.length} artifact(s) with no extracted text`);
  if (!write) {
    for (const row of rows) {
      console.log(
        `  ${row.user.name} · ${row.kind} · ${row.contentType} · ${Math.round((row.sizeBytes ?? 0) / 1024)}KB`,
      );
    }
    console.log("\nRe-run with --write to prepare them.");
    return;
  }

  let recovered = 0;
  for (const row of rows) {
    const label = `${row.user.name} · ${row.kind} · ${row.contentType}`;
    try {
      const out = await handlePreparePrerequisite({ userId: row.userId, kind: row.kind });
      const after = await prisma.interviewPrerequisite.findUnique({
        where: { userId_kind: { userId: row.userId, kind: row.kind } },
        select: { extractedText: true, digest: true },
      });
      const chars = after?.extractedText?.length ?? 0;
      if (chars > 0) recovered += 1;
      console.log(
        `${chars > 0 ? "OK  " : "MISS"} ${label} → ${chars} chars, digest=${after?.digest ? "yes" : "no"}${out.reason ? ` (${out.reason})` : ""}`,
      );
    } catch (err) {
      console.log(`ERR  ${label} → ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n${recovered}/${rows.length} recovered`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
