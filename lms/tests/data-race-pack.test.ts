import { describe, expect, it } from "vitest";
import {
  DATA_RACE_DATASET_ID,
  DATA_RACE_DIFFICULTIES,
  DATA_RACE_SECTIONS,
  DATA_RACE_SOURCE_SHA256,
  DATA_RACE_TIMERS,
  validateDataRacePack,
} from "../lib/data-race-pack";

const answerSchedules = [
  ["a", "b", "c", "d", "a", "b", "c", "d", "a", "b"],
  ["b", "c", "d", "a", "b", "c", "d", "a", "b", "c"],
  ["c", "d", "a", "b", "c", "d", "a", "b", "c", "d"],
  ["d", "a", "b", "c", "d", "a", "b", "c", "d", "a"],
] as const;

function validPack() {
  return {
    schemaVersion: "data-race-pack/1.0",
    datasetId: DATA_RACE_DATASET_ID,
    sourceSha256: DATA_RACE_SOURCE_SHA256,
    rowCount: 1000,
    packs: DATA_RACE_SECTIONS.map((sectionCode, sectionIndex) => ({
      sectionCode,
      title: "Data Race",
      questions: DATA_RACE_TIMERS.map((durationSeconds, index) => ({
        stableId: `S3-DATA-RACE-${sectionCode}-${String(index + 1).padStart(2, "0")}@1`,
        position: index + 1,
        prompt: `Question ${index + 1}`,
        options: ["a", "b", "c", "d"].map((id) => ({ id, label: `${id.toUpperCase()}-${index}` })),
        correctOptionId: answerSchedules[sectionIndex % 4][index],
        difficulty: DATA_RACE_DIFFICULTIES[index],
        durationSeconds,
        sourceNote: "Verified fixture",
      })),
    })),
  };
}

describe("Data Race pack validation", () => {
  it("accepts the exact A-H release contract", () => {
    expect(validateDataRacePack(validPack()).packs).toHaveLength(8);
  });

  it("rejects any timer below the approved progression", () => {
    const pack = structuredClone(validPack());
    Reflect.set(pack.packs[0].questions[0], "durationSeconds", 30);
    expect(() => validateDataRacePack(pack)).toThrow("must use a 60-second timer");
  });

  it("rejects biased answer positions", () => {
    const pack = structuredClone(validPack());
    pack.packs[0].questions.forEach((question) => { question.correctOptionId = "a"; });
    expect(() => validateDataRacePack(pack)).toThrow("2/2/3/3 distribution");
  });

  it("rejects unexpected option IDs and duplicate labels", () => {
    const wrongIds = structuredClone(validPack());
    wrongIds.packs[0].questions[0].options[3].id = "e";
    expect(() => validateDataRacePack(wrongIds)).toThrow("option IDs a-d in order");

    const duplicateLabels = structuredClone(validPack());
    duplicateLabels.packs[0].questions[0].options[3].label = duplicateLabels.packs[0].questions[0].options[0].label;
    expect(() => validateDataRacePack(duplicateLabels)).toThrow("four distinct labels");
  });

  it("rejects packs not bound to the frozen dataset", () => {
    const pack = structuredClone(validPack());
    Reflect.set(pack, "sourceSha256", "0".repeat(64));
    expect(() => validateDataRacePack(pack)).toThrow();
  });
});
