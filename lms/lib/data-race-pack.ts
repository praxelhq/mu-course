import { z } from "zod";

export const DATA_RACE_DATASET_ID = "trustmrr-s3-live-2026-07-30-v1";
export const DATA_RACE_SOURCE_SHA256 = "36d32ac250effbba9cb2c2fcb2cb3ad4c61396a8b2f501d3d7e20be061f1ff77";
export const DATA_RACE_SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const DATA_RACE_TIMERS = [60, 75, 75, 90, 90, 105, 120] as const;
export const DATA_RACE_DIFFICULTIES = [
  "Easy", "Moderate", "Moderate", "Challenging", "Challenging", "Hard", "Expert",
] as const;
export const DATA_RACE_QUESTION_COUNT = DATA_RACE_TIMERS.length;
const OPTION_IDS = ["a", "b", "c", "d"] as const;
// Seven items cannot split four positions evenly, so each section runs 2/2/2/1 and the short
// position rotates by section. A release covers only the sections being (re)issued, so the
// global spread is checked as "within one of even" rather than a fixed per-option count.
const SECTION_ANSWER_SHAPE = "1,2,2,2";

const Question = z.object({
  stableId: z.string().min(1),
  position: z.number().int().min(1).max(DATA_RACE_QUESTION_COUNT),
  prompt: z.string().min(1),
  options: z.array(z.object({ id: z.string(), label: z.string().min(1) })).length(4),
  correctOptionId: z.string(),
  difficulty: z.string(),
  durationSeconds: z.number().int(),
  sourceNote: z.string().min(1),
  // Instructor-only explanation of which wrong method each distractor encodes. It is
  // never loaded into DataRaceQuestion and never reaches a student response.
  trapNote: z.string().min(1).optional(),
});

const DataRacePack = z.object({
  schemaVersion: z.literal("data-race-pack/1.0"),
  datasetId: z.literal(DATA_RACE_DATASET_ID),
  sourceSha256: z.literal(DATA_RACE_SOURCE_SHA256),
  rowCount: z.literal(1000),
  packs: z.array(z.object({
    sectionCode: z.string(),
    title: z.literal("Data Race"),
    questions: z.array(Question).length(DATA_RACE_QUESTION_COUNT),
  })).min(1).max(DATA_RACE_SECTIONS.length),
});

export type ValidatedDataRacePack = z.infer<typeof DataRacePack>;

function fail(message: string): never {
  throw new Error(`Invalid Data Race pack: ${message}`);
}

export function validateDataRacePack(input: unknown): ValidatedDataRacePack {
  const parsed = DataRacePack.parse(input);
  // A release covers only the sections being issued. Sections that have already raced are
  // deliberately absent so reloading can never overwrite items their learners answered.
  const sectionCodes = parsed.packs.map((pack) => pack.sectionCode);
  if (new Set(sectionCodes).size !== sectionCodes.length) fail("must not repeat a section");
  const unknown = sectionCodes.filter((code) => !DATA_RACE_SECTIONS.includes(code as typeof DATA_RACE_SECTIONS[number]));
  if (unknown.length > 0) fail(`unknown section code ${unknown.join(", ")}; expected A-H`);

  const globalStableIds = new Set<string>();
  const globalAnswerCounts = Object.fromEntries(OPTION_IDS.map((id) => [id, 0])) as Record<string, number>;

  for (const pack of parsed.packs) {
    const sectionAnswerCounts = Object.fromEntries(OPTION_IDS.map((id) => [id, 0])) as Record<string, number>;
    const questions = [...pack.questions].sort((a, b) => a.position - b.position);

    questions.forEach((question, index) => {
      const position = index + 1;
      if (question.position !== position) {
        fail(`Section ${pack.sectionCode} must have positions 1-${DATA_RACE_QUESTION_COUNT} exactly once`);
      }
      if (question.stableId !== `S3-DATA-RACE-${pack.sectionCode}-${String(position).padStart(2, "0")}@2`) {
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
    if (sectionDistribution.join(",") !== SECTION_ANSWER_SHAPE) {
      fail(`Section ${pack.sectionCode} answer positions must have a ${SECTION_ANSWER_SHAPE.replaceAll(",", "/")} distribution`);
    }
  }

  const spread = OPTION_IDS.map((id) => globalAnswerCounts[id]);
  if (Math.max(...spread) - Math.min(...spread) > 1) {
    fail("answer positions must be balanced to within one across the release");
  }
  return parsed;
}
