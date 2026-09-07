import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "../lib/db";
import { validateDataRacePack } from "../lib/data-race-pack";

const APPROVED_PACK_SHA256 = "bde5c3f7c8d95a3272e7d52fc0b0811ecb01ab579ca0780cde125127e966fb81";

async function main() {
  const input = process.env.DATA_RACE_PACK_PATH;
  if (!input) throw new Error("Set DATA_RACE_PACK_PATH to the private generated JSON file.");
  const contents = await fs.readFile(path.resolve(input), "utf8");
  const digest = createHash("sha256").update(contents).digest("hex");
  if (digest !== APPROVED_PACK_SHA256) {
    throw new Error("The Data Race pack does not match the independently audited release.");
  }
  const parsed = validateDataRacePack(JSON.parse(contents));

  await prisma.$transaction(async (tx) => {
    for (const pack of parsed.packs) {
      const section = await tx.section.findUniqueOrThrow({ where: { code: pack.sectionCode } });
      const race = await tx.dataRace.upsert({
        where: { sessionNo_sectionId: { sessionNo: 3, sectionId: section.id } },
        create: { sessionNo: 3, sectionId: section.id, title: pack.title, datasetId: parsed.datasetId, sourceSha256: parsed.sourceSha256 },
        update: { title: pack.title, datasetId: parsed.datasetId, sourceSha256: parsed.sourceSha256 },
      });
      const responseCount = await tx.dataRaceResponse.count({ where: { question: { raceId: race.id } } });
      if (responseCount > 0) throw new Error(`Section ${pack.sectionCode} already has responses; reset before reloading.`);
      if (!(["waiting", "complete"] as const).includes(race.phase as "waiting" | "complete")) {
        throw new Error(`Section ${pack.sectionCode} is active; end or reset it before reloading.`);
      }
      await tx.dataRaceQuestion.deleteMany({ where: { raceId: race.id } });
      await tx.dataRaceQuestion.createMany({
        data: pack.questions.map((question) => ({
          raceId: race.id,
          position: question.position,
          prompt: question.prompt,
          options: question.options,
          correctOptionId: question.correctOptionId,
          difficulty: question.difficulty,
          durationSeconds: question.durationSeconds,
          sourceNote: `${parsed.datasetId} · ${question.stableId} · ${question.sourceNote}`,
        })),
      });
    }
  }, { maxWait: 10_000, timeout: 60_000 });
  for (const pack of parsed.packs) console.log(`Loaded Section ${pack.sectionCode}: ${pack.questions.length} questions`);
}

main().finally(() => prisma.$disconnect());
