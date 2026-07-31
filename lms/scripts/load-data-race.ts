import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../lib/db";

const EXPECTED_DATASET_ID = "trustmrr-s3-live-2026-07-30-v1";
const EXPECTED_SOURCE_SHA256 = "36d32ac250effbba9cb2c2fcb2cb3ad4c61396a8b2f501d3d7e20be061f1ff77";
const EXPECTED_SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const Question = z.object({
  stableId: z.string(),
  position: z.number().int().positive(),
  prompt: z.string().min(1),
  options: z.array(z.object({ id: z.string(), label: z.string() })).length(4),
  correctOptionId: z.string(),
  difficulty: z.string(),
  durationSeconds: z.number().int().min(15).max(120),
  sourceNote: z.string(),
}).superRefine((question, ctx) => {
  const ids = question.options.map((option) => option.id);
  const labels = question.options.map((option) => option.label);
  if (new Set(ids).size !== 4) ctx.addIssue({ code: "custom", message: "Option IDs must be unique." });
  if (new Set(labels).size !== 4) ctx.addIssue({ code: "custom", message: "Option labels must be unique." });
  if (!ids.includes(question.correctOptionId)) ctx.addIssue({ code: "custom", message: "Correct option must exist." });
});
const Pack = z.object({
  schemaVersion: z.literal("data-race-pack/1.0"),
  datasetId: z.string(),
  sourceSha256: z.string().length(64),
  rowCount: z.number().int().positive(),
  packs: z.array(z.object({ sectionCode: z.string(), title: z.string(), questions: z.array(Question).length(10) })),
});

async function main() {
  const input = process.env.DATA_RACE_PACK_PATH;
  if (!input) throw new Error("Set DATA_RACE_PACK_PATH to the private generated JSON file.");
  const parsed = Pack.parse(JSON.parse(await fs.readFile(path.resolve(input), "utf8")));
  if (parsed.datasetId !== EXPECTED_DATASET_ID || parsed.sourceSha256 !== EXPECTED_SOURCE_SHA256 || parsed.rowCount !== 1000) {
    throw new Error("The Data Race pack is not bound to the approved frozen dataset release.");
  }
  const codes = parsed.packs.map((pack) => pack.sectionCode).sort();
  if (JSON.stringify(codes) !== JSON.stringify(EXPECTED_SECTIONS)) {
    throw new Error("Pack must contain exactly one question set for every section A-H.");
  }
  for (const pack of parsed.packs) {
    const positions = pack.questions.map((question) => question.position).sort((a, b) => a - b);
    const stableIds = pack.questions.map((question) => question.stableId);
    if (positions.some((position, index) => position !== index + 1) || new Set(stableIds).size !== 10) {
      throw new Error(`Section ${pack.sectionCode} must have unique positions 1-10 and stable IDs.`);
    }
  }

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
  });
  for (const pack of parsed.packs) console.log(`Loaded Section ${pack.sectionCode}: ${pack.questions.length} questions`);
}

main().finally(() => prisma.$disconnect());
