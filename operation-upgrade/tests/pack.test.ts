import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PACK } from "@/scripts/build-pack";

/// The printed pack is generated from the same modules the app runs on. This
/// fails the moment the committed pack drifts from the content — a facilitator
/// handing out paper and a student reading a screen must never disagree.
describe("the printed pack matches what the app teaches", () => {
  for (const [name, make] of Object.entries(PACK)) {
    it(`pack/${name} is current`, () => {
      const onDisk = readFileSync(join(process.cwd(), "pack", name), "utf8");
      expect(onDisk).toBe(make());
    });
  }

  it("says out loud that the company is invented, on every sheet a student reads", () => {
    for (const name of ["case-brief.md", "the-seven-problems.md", "company-brain-lab.md"]) {
      expect(readFileSync(join(process.cwd(), "pack", name), "utf8")).toContain("fictional company");
    }
  });

  it("keeps the answer key out of the student sheets", () => {
    const canvas = readFileSync(join(process.cwd(), "pack", "paper-canvas.md"), "utf8");
    expect(canvas).not.toContain("Facilitator only");
    expect(canvas).not.toContain("answer key");
  });
});
