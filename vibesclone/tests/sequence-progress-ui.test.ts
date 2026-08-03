import { describe, expect, it } from "vitest";
import { completedIndexes, firstIncompleteIndex, nextIncompleteIndex } from "@/lib/progress";

const fiveSteps = [{ order: 0 }, { order: 1 }, { order: 2 }, { order: 3 }, { order: 4 }];

describe("sequence progress derivations", () => {
  it("derives initial selection from the first incomplete step (AE4)", () => {
    expect(firstIncompleteIndex(fiveSteps, [0, 1])).toBe(2);
  });

  it("offers the next incomplete step after the current one and a finished state when all are complete (AE5)", () => {
    expect(nextIncompleteIndex(fiveSteps, [0, 1, 2], 3)).toBe(4);
    expect(nextIncompleteIndex(fiveSteps, [0, 1, 2, 3, 4], 3)).toBeNull();
    expect(completedIndexes(fiveSteps, [0, 1, 2, 3, 4]).size).toBe(fiveSteps.length);
  });

  it("does not wrap backward past the current step", () => {
    expect(nextIncompleteIndex(fiveSteps, [0, 2, 3, 4], 3)).toBeNull();
  });

  it("ignores stale orders absent from the rendered steps (revoked license)", () => {
    const baseOnly = [{ order: 0 }];
    expect(completedIndexes(baseOnly, [0, 3, 7]).size).toBe(1);
    expect(firstIncompleteIndex(baseOnly, [3, 7])).toBe(0);
  });

  it("derives selection 0 and an empty completed set from an empty persisted array", () => {
    expect(completedIndexes(fiveSteps, []).size).toBe(0);
    expect(firstIncompleteIndex(fiveSteps, [])).toBe(0);
  });
});
