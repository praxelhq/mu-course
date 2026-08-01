import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

function inspectGenerator() {
  const generatorPath = path.resolve("scripts/course-data/generate_data_race_questions.py");
  const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("data_race_generator", ${JSON.stringify(generatorPath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
counts = {key: 0 for key in "abcd"}
section_counts = {}
for section in module.SECTIONS:
    values = ["abcd"[module.answer_position(section, position)] for position in range(1, 11)]
    section_counts[section] = {key: values.count(key) for key in "abcd"}
    for value in values:
        counts[value] += 1
print(json.dumps({
    "zero": module.number(0),
    "one": module.number(1),
    "false": module.number(False),
    "true": module.number(True),
    "blank": module.number(""),
    "null": module.number(None),
    "correlation": module.corr([0, 1, 2], [0, 1, 4]),
    "times": module.TIMES,
    "ranked": module.ranked_values([
        {"value": "Zulu"}, {"value": "Alpha"}, {"value": "Zulu"},
        {"value": "Beta"}, {"value": "Alpha"}, {"value": "Gamma"}
    ], "value"),
    "counts": counts,
    "section_counts": section_counts,
}))
`;
  return JSON.parse(execFileSync("python3", ["-c", script], { encoding: "utf8" }));
}

describe("Data Race generator behavior", () => {
  it("retains numeric zero and one while excluding booleans and blanks", () => {
    const result = inspectGenerator();
    expect(result).toMatchObject({ zero: 0, one: 1, false: null, true: null, blank: null, null: null });
    expect(result.correlation).toBeCloseTo(0.9607689228, 9);
  });

  it("enforces at least 60 seconds and balanced answer positions", () => {
    const result = inspectGenerator();
    expect(result.times).toEqual([60, 60, 60, 75, 75, 75, 90, 90, 105, 120]);
    expect(result.ranked).toEqual(["Alpha", "Zulu", "Beta", "Gamma"]);
    expect(result.counts).toEqual({ a: 20, b: 20, c: 20, d: 20 });
    for (const counts of Object.values(result.section_counts) as Array<Record<string, number>>) {
      expect(Object.values(counts).sort()).toEqual([2, 2, 3, 3]);
    }
  });
});
