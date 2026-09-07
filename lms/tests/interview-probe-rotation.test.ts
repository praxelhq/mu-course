import { describe, expect, it } from "vitest";
import {
  APPLY_BACK_RULE,
  CONTEXT_ISOLATION_VARIANTS,
  REGULATED_SHIPPING_VARIANTS,
  SKILL_VARIANTS,
  pickVariant,
} from "../lib/interview/probes";

// Students compare notes after the viva. Rotation makes a rehearsed script
// transfer badly; the apply-back rule is what makes a leaked question mostly
// worthless, because the follow-up is about the student's own uploaded file.

const ALL = [
  ["isolation", CONTEXT_ISOLATION_VARIANTS],
  ["skill", SKILL_VARIANTS],
  ["regulated", REGULATED_SHIPPING_VARIANTS],
] as const;

describe("probe rotation", () => {
  it("gives the same student the same question every time", () => {
    // A reconnect mid-interview must not re-roll the question.
    for (const [probe, variants] of ALL) {
      const first = pickVariant("user_abc", probe, variants);
      for (let i = 0; i < 20; i += 1) {
        expect(pickVariant("user_abc", probe, variants)).toBe(first);
      }
    }
  });

  it("spreads a cohort across every variant", () => {
    for (const [probe, variants] of ALL) {
      const seen = new Set(
        Array.from({ length: 400 }, (_, i) => pickVariant(`student_${i}`, probe, variants)),
      );
      expect(seen.size).toBe(variants.length);
    }
  });

  it("does not hand one student the same slot in all three probes", () => {
    // Otherwise "I got the first one" would leak the whole set.
    const picks = ALL.map(([probe, variants]) =>
      variants.indexOf(pickVariant("user_abc", probe, variants) as never),
    );
    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it("offers enough variants that a corridor conversation is unreliable", () => {
    for (const [, variants] of ALL) expect(variants.length).toBeGreaterThanOrEqual(4);
  });
});

describe("variant quality", () => {
  it("never hints the answer in the context-isolation probe", () => {
    // The whole value is whether they reach for projects/workspaces unaided.
    for (const v of CONTEXT_ISOLATION_VARIANTS) {
      expect(v.toLowerCase()).not.toMatch(/\bproject(s)? feature|separate project|workspace per|use projects\b/);
    }
  });

  it("keeps every isolation variant about cross-contamination", () => {
    for (const v of CONTEXT_ISOLATION_VARIANTS) {
      expect(v.toLowerCase()).toMatch(/confus|bleed|pulling details|does not belong|belong/);
    }
  });

  it("keeps every regulated variant in a genuinely regulated sector", () => {
    for (const v of REGULATED_SHIPPING_VARIANTS) {
      expect(v.toLowerCase()).toMatch(/healthcare|fintech|hospital|bank|insurance/);
      expect(v.toLowerCase()).toContain("lovable");
    }
  });

  it("keeps every skill variant anchored in the student's own repeated work", () => {
    for (const v of SKILL_VARIANTS) expect(v.toLowerCase()).toMatch(/repeat|one thing|one task|why that/);
  });
});

describe("apply-back rule", () => {
  it("assumes the headline answer may be borrowed", () => {
    expect(APPLY_BACK_RULE).toMatch(/discuss these questions with each other|borrowed/i);
  });

  it("sends the follow-up to their own uploaded artifact", () => {
    expect(APPLY_BACK_RULE).toMatch(/workflow or sector map they uploaded/i);
  });
});
