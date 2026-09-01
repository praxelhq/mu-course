import { RATIONALES, DRILL_ORDER, DRILLS, type Quality, type DrillPhase } from "@/lib/content/choices";
import type { Approach } from "@/lib/content/problems";

/// Does the reason they gave actually describe the thing they chose? A student
/// who says a new hire "reaches all twenty-five outlets on the same day" has
/// described something that does not happen, and that is worth showing them.
export function rationaleFit(rationaleId: string, approach: Approach, unlocksSomething: boolean): {
  quality: Quality; note: string;
} {
  const r = RATIONALES.find((x) => x.id === rationaleId);
  if (!r) return { quality: "workable", note: "" };

  if (!r.fits.includes(approach)) {
    return {
      quality: "weak",
      note: r.note,
    };
  }
  if (r.needsUnlock && !unlocksSomething) {
    return {
      quality: "workable",
      note: "True in general, and here it unlocks nothing you went on to build. The prerequisite argument only lands when you actually built the thing it was a prerequisite for.",
    };
  }
  return { quality: "strong", note: r.note };
}

export type DrillResult = {
  correct: boolean;
  /// Phases that were done out of order, worst first.
  slips: { moved: DrillPhase; before: DrillPhase; cost: string }[];
};

const SLIP_COST: Record<string, string> = {
  "restore>contain": "You put it back before finding everyone it had already reached. Those people were never told, and they still believe what it said.",
  "restore>fix": "You put it back before fixing the cause. It is now doing the same thing again, and this time you knew.",
  "restore>verify": "You put it back without checking. You are trusting that it is fixed, which is exactly the posture that produced this.",
  "fix>diagnose": "You fixed something before working out what actually broke. If you guessed right you were lucky, and luck is not a control.",
  "contain>stop": "You went looking for who else was affected while it was still doing it. The list kept growing behind you.",
  "diagnose>stop": "You started investigating while the harm was ongoing. Understanding can wait ninety seconds; the bleeding cannot.",
  "verify>fix": "You tested before changing anything, so you have confirmed the fault rather than the fix.",
};

/// Scored on the order of the phases rather than exact positions — the lesson
/// is stop, contain, diagnose, fix, verify, restore, not memorising six lines.
export function scoreDrill(faultId: string, orderedIds: readonly string[]): DrillResult {
  const steps = DRILLS[faultId] ?? [];
  const phases = orderedIds
    .map((id) => steps.find((s) => s.id === id)?.phase)
    .filter((p): p is DrillPhase => Boolean(p));

  const slips: DrillResult["slips"] = [];
  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      const early = phases[i];
      const late = phases[j];
      // `early` was placed before `late`, but belongs after it.
      if (DRILL_ORDER.indexOf(early) > DRILL_ORDER.indexOf(late)) {
        const cost = SLIP_COST[`${early}>${late}`];
        if (cost) slips.push({ moved: early, before: late, cost });
      }
    }
  }
  return { correct: slips.length === 0 && phases.length === steps.length, slips: slips.slice(0, 3) };
}

export function correctDrillOrder(faultId: string): string[] {
  const steps = DRILLS[faultId] ?? [];
  return [...steps].sort((a, b) => DRILL_ORDER.indexOf(a.phase) - DRILL_ORDER.indexOf(b.phase)).map((s) => s.id);
}

/// A deterministic shuffle, so a student who reloads gets the same starting
/// order rather than a fresh puzzle.
export function shuffledDrill(faultId: string, seed: number): string[] {
  const ids = (DRILLS[faultId] ?? []).map((s) => s.id);
  const out = [...ids];
  let n = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    const j = n % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
