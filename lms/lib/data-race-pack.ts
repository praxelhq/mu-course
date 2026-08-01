import { z } from "zod";

export const DATA_RACE_DATASET_ID = "trustmrr-s3-live-2026-07-30-v1";
export const DATA_RACE_SOURCE_SHA256 = "36d32ac250effbba9cb2c2fcb2cb3ad4c61396a8b2f501d3d7e20be061f1ff77";
export const DATA_RACE_SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const DATA_RACE_TIMERS = [60, 60, 60, 75, 75, 75, 90, 90, 105, 120] as const;
export const DATA_RACE_DIFFICULTIES = [
  "Easy", "Easy", "Easy", "Moderate", "Moderate", "Moderate",
  "Challenging", "Challenging", "Hard", "Expert",
] as const;
const OPTION_IDS = ["a", "b", "c", "d"] as const;

const Question = z.object({
  stableId: z.string().min(1),
  position: z.number().int().min(1).max(10),
  prompt: z.string().min(1),
  options: z.array(z.object({ id: z.string(), label: z.string().min(1) })).length(4),
  correctOptionId: z.string(),
  difficulty: z.string(),
  durationSeconds: z.number().int(),
  sourceNote: z.string().min(1),
});

const DataRacePack = z.object({
  schemaVersion: z.literal("data-race-pack/1.0"),
  datasetId: z.literal(DATA_RACE_DATASET_ID),
  sourceSha256: z.literal(DATA_RACE_SOURCE_SHA256),
  rowCount: z.literal(1000),
  packs: z.array(z.object({
    sectionCode: z.string(),
    title: z.literal("Data Race"),
    questions: z.array(Question).length(10),
  })).length(8),
});

export type ValidatedDataRacePack = z.infer<typeof DataRacePack>;

function fail(message: string): never {
  throw new Error(`Invalid Data Race pack: ${message}`);
}

export function validateDataRacePack(input: unknown): ValidatedDataRacePack {
  const parsed = DataRacePack.parse(input);
  const sectionCodes = parsed.packs.map((pack) => pack.sectionCode).sort();
  if (sectionCodes.join(",") !== DATA_RACE_SECTIONS.join(",")) {
    fail("must contain exactly one pack for every section A-H");
  }

  const globalStableIds = new Set<string>();
  const globalAnswerCounts = Object.fromEntries(OPTION_IDS.map((id) => [id, 0])) as Record<string, number>;

  for (const pack of parsed.packs) {
    const sectionAnswerCounts = Object.fromEntries(OPTION_IDS.map((id) => [id, 0])) as Record<string, number>;
    const questions = [...pack.questions].sort((a, b) => a.position - b.position);

    questions.forEach((question, index) => {
      const position = index + 1;
      if (question.position !== position) fail(`Section ${pack.sectionCode} must have positions 1-10 exactly once`);
      if (question.stableId !== `S3-DATA-RACE-${pack.sectionCode}-${String(position).padStart(2, "0")}@1`) {
        fail(`Section ${pack.sectionCode} question ${position} has an unexpected stable ID`);
      }
      if (globalStableIds.has(question.stableId)) fail(`duplicate stable ID ${question.stableId}`);
      globalStableIds.add(question.stableId);
      if (question.durationSeconds !== DATA_RACE_TIMERS[index]) {
        fail(`Section ${pack.sectionCode} question ${position} must use a ${DATA_RACE_TIMERS[index]}-second timer`);
      }
      if (question.difficulty !== DATA_RACE_DIFFICULTIES[index]) {
        fail(`Section ${pack.sectionCode} question ${position} must be ${DATA_RACE_DIFFICULTIES[index]}`);
      }
      const ids = question.options.map((option) => option.id);
      if (ids.join(",") !== OPTION_IDS.join(",")) fail(`Section ${pack.sectionCode} question ${position} must use option IDs a-d in order`);
      if (new Set(question.options.map((option) => option.label)).size !== 4) {
        fail(`Section ${pack.sectionCode} question ${position} must have four distinct labels`);
      }
      if (!OPTION_IDS.includes(question.correctOptionId as typeof OPTION_IDS[number])) {
        fail(`Section ${pack.sectionCode} question ${position} has an invalid correct option`);
      }
      sectionAnswerCounts[question.correctOptionId] += 1;
      globalAnswerCounts[question.correctOptionId] += 1;
    });

    const sectionDistribution = OPTION_IDS.map((id) => sectionAnswerCounts[id]).sort((a, b) => a - b);
    if (sectionDistribution.join(",") !== "2,2,3,3") {
      fail(`Section ${pack.sectionCode} answer positions must have a 2/2/3/3 distribution`);
    }
  }

  if (OPTION_IDS.some((id) => globalAnswerCounts[id] !== 20)) {
    fail("answer positions must be globally balanced at 20 each");
  }
  return parsed;
}
