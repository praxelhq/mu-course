import { describe, expect, it } from "vitest";
import { emptyBoard, type Board } from "@/lib/engine/types";
import { rationaleFit, scoreDrill, correctDrillOrder, shuffledDrill } from "@/lib/engine/score";
import { troubles, needsRescue, pressOn } from "@/lib/engine/coach";
import { DRILLS, CONSTRAINT_MOVES, FAULT_DIAGNOSIS, FAULT_CONTROLS, RATIONALES } from "@/lib/content/choices";
import { CONSTRAINTS, FAULTS } from "@/lib/content/events";

const board = (over: Partial<Board> = {}): Board => ({ ...emptyBoard("Ananya R", 0), ...over });

describe("a reason is judged against what they actually chose", () => {
  it("accepts the prerequisite argument when the prerequisite unlocked something", () => {
    expect(rationaleFit("prerequisite", "redesign", true).quality).toBe("strong");
  });

  it("softens it when they never built the thing it was a prerequisite for", () => {
    const fit = rationaleFit("prerequisite", "redesign", false);
    expect(fit.quality).toBe("workable");
    expect(fit.note).toContain("unlocks nothing");
  });

  it("calls out a hire described as reaching all twenty-five outlets at once", () => {
    const fit = rationaleFit("scales", "hire", false);
    expect(fit.quality).toBe("weak");
    expect(fit.note).toContain("untrue of a person");
  });

  it("warns that hiring a second expert shares a dependency rather than removing it", () => {
    expect(rationaleFit("single-point", "hire", false).note).toContain("two single points of failure");
  });
});

describe("the response drill teaches an order", () => {
  const fault = "allergen";
  const right = correctDrillOrder(fault);

  it("accepts stop, contain, diagnose, fix, verify, restore", () => {
    const r = scoreDrill(fault, right);
    expect(r.correct).toBe(true);
    expect(r.slips).toEqual([]);
  });

  it("names the cost of restoring before containing", () => {
    const wrong = [...right];
    wrong.splice(wrong.indexOf(right[5]), 1);
    wrong.splice(1, 0, right[5]);
    const r = scoreDrill(fault, wrong);
    expect(r.correct).toBe(false);
    expect(r.slips.some((s) => s.cost.includes("still believe what it said"))).toBe(true);
  });

  it("names the cost of fixing before diagnosing", () => {
    const wrong = [right[0], right[1], right[3], right[2], right[4], right[5]];
    const r = scoreDrill(fault, wrong);
    expect(r.slips.some((s) => s.moved === "fix" && s.before === "diagnose")).toBe(true);
  });

  it("gives the same starting shuffle to the same seat twice", () => {
    expect(shuffledDrill(fault, 12)).toEqual(shuffledDrill(fault, 12));
    expect(shuffledDrill(fault, 12)).not.toEqual(right);
  });

  it("gives every fault a full six-step drill", () => {
    for (const f of FAULTS) {
      const steps = DRILLS[f.id];
      expect(steps, f.id).toBeDefined();
      expect(steps).toHaveLength(6);
      expect(new Set(steps.map((s) => s.phase)).size).toBe(6);
    }
  });
});

describe("Mariga arrives when a plan is genuinely in trouble", () => {
  it("comes for a plan that built an assistant on an uncleaned library", () => {
    const b = board({ picks: { docs: ["build"] }, gates: { docs: "arun" } });
    expect(troubles(b).map((t) => t.id)).toContain("built-on-mess");
  });

  it("comes for a plan whose assistant would repeat a salary", () => {
    const b = board({ picks: { docs: ["build"] }, indexed: ["payroll"], asked: ["salary"] });
    expect(troubles(b).map((t) => t.id)).toContain("brain-unsafe");
    expect(needsRescue(b)).toBe(true);
  });

  it("comes for a plan nobody has committed to", () => {
    expect(needsRescue(board())).toBe(true);
  });

  it("stays away from a sequenced plan and asks two questions instead", () => {
    const b = board({
      picks: { docs: ["redesign", "build"], reporting: ["redesign"] },
      gates: { docs: "arun", reporting: "sunita" },
      rationales: { docs: "prerequisite", reporting: "cheapest-pain" },
      indexed: ["allergen26", "refunds"],
      asked: ["nuts", "refund", "salary"],
      leaving: "hiring", leavingReason: "no-trading-impact",
    });
    expect(needsRescue(b)).toBe(false);
    const questions = pressOn(b);
    expect(questions).toHaveLength(2);
    for (const q of questions) expect(q.length).toBeGreaterThan(30);
  });

  it("never leaves a student with nothing said to them", () => {
    expect(pressOn(board({ picks: { docs: ["redesign"] } })).length).toBeGreaterThan(0);
  });
});

describe("every card a student can be dealt has choices behind it", () => {
  it("gives every constraint three moves", () => {
    for (const c of CONSTRAINTS) {
      expect(CONSTRAINT_MOVES[c.id], c.id).toHaveLength(3);
      expect(CONSTRAINT_MOVES[c.id].some((m) => m.quality === "strong"), c.id).toBe(true);
    }
  });

  it("gives every fault a diagnosis and a control, each with a wrong-but-tempting option", () => {
    for (const f of FAULTS) {
      expect(FAULT_DIAGNOSIS[f.id], f.id).toBeDefined();
      expect(FAULT_CONTROLS[f.id], f.id).toBeDefined();
      expect(FAULT_DIAGNOSIS[f.id].some((d) => d.quality === "weak"), f.id).toBe(true);
      expect(FAULT_CONTROLS[f.id].some((d) => d.quality === "strong"), f.id).toBe(true);
    }
  });

  it("explains itself on every option, whichever one is picked", () => {
    const all = [...RATIONALES, ...Object.values(CONSTRAINT_MOVES).flat(), ...Object.values(FAULT_DIAGNOSIS).flat(), ...Object.values(FAULT_CONTROLS).flat()];
    for (const o of all) expect(o.note.length, o.id).toBeGreaterThan(40);
  });

  it("shows every fault what actually happened before asking them to explain it", () => {
    for (const f of FAULTS) {
      expect(f.trace.length, f.id).toBeGreaterThan(3);
      expect(f.trace.some((r) => r.bad), f.id).toBe(true);
      expect(f.toll.length, f.id).toBeGreaterThan(40);
    }
  });
});
