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
for section in module.ALL_SECTIONS:
    values = ["abcd"[module.answer_position(section, position)] for position in range(1, len(module.TIMES) + 1)]
    section_counts[section] = {key: values.count(key) for key in "abcd"}
    for value in values:
        counts[value] += 1
print(json.dumps({
    "zero": module.number(0),
    "one": module.number(1),
    "false": module.number(False),
    "true": module.number(True),
    "blank": module.number(""),
    "whitespace": module.number("   "),
    "null": module.number(None),
    "text": module.number("n/a"),
    "currency": module.number("$1,250.50"),
    "blank_cell": module.is_blank({"mrr_usd": "  "}, "mrr_usd"),
    "zero_cell": module.is_blank({"mrr_usd": "0"}, "mrr_usd"),
    "markets": module.markets({"markets_json": '["AI", "SaaS"]'}),
    "markets_empty": module.markets({"markets_json": "[]"}),
    "markets_junk": module.markets({"markets_json": "not json"}),
    "times": module.TIMES,
    "difficulties": module.DIFFICULTIES,
    "counts": counts,
    "section_counts": section_counts,
}))
`;
  return JSON.parse(execFileSync("python3", ["-c", script], { encoding: "utf8" }));
}

describe("Data Race generator behavior", () => {
  it("keeps numeric zero distinct from blank, boolean and unparseable cells", () => {
    const result = inspectGenerator();
    expect(result).toMatchObject({
      zero: 0,
      one: 1,
      false: null,
      true: null,
      blank: null,
      whitespace: null,
      null: null,
      text: null,
      currency: 1250.5,
    });
    // A reported zero is an observation; only an empty cell is a blank.
    expect(result.blank_cell).toBe(true);
    expect(result.zero_cell).toBe(false);
  });

  it("parses markets_json as a list and tolerates unusable cells", () => {
    const result = inspectGenerator();
    expect(result.markets).toEqual(["AI", "SaaS"]);
    expect(result.markets_empty).toEqual([]);
    expect(result.markets_junk).toEqual([]);
  });

  it("runs seven escalating items with balanced answer positions", () => {
    const result = inspectGenerator();
    expect(result.times).toEqual([60, 75, 75, 90, 90, 105, 120]);
    expect(result.difficulties).toEqual([
      "Easy", "Moderate", "Moderate", "Challenging", "Challenging", "Hard", "Expert",
    ]);
    expect(result.counts).toEqual({ a: 14, b: 14, c: 14, d: 14 });
    for (const counts of Object.values(result.section_counts) as Array<Record<string, number>>) {
      expect(Object.values(counts).sort()).toEqual([1, 2, 2, 2]);
    }
  });
});
