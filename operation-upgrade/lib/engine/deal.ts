import { CONSTRAINTS, FAULTS, type Constraint, type Fault } from "@/lib/content/events";
import { PROBLEM } from "@/lib/content/problems";
import { PERSON } from "@/lib/content/cast";
import { gateLoad } from "./economics";
import type { Board } from "./types";

/// Constraints go round the room by seat, so the four people at a table get
/// four different problems and the debrief has something to compare.
export function dealConstraint(seat: number): Constraint {
  const i = ((seat % CONSTRAINTS.length) + CONSTRAINTS.length) % CONSTRAINTS.length;
  return CONSTRAINTS[i];
}

/// Faults are dealt from what the student actually built. Nobody gets a failure
/// in a system they did not choose — that is the whole point of it landing.
export function eligibleFaults(board: Board): Fault[] {
  const out: Fault[] = [];
  for (const [problemId, approaches] of Object.entries(board.picks)) {
    for (const approach of approaches) {
      const option = PROBLEM.get(problemId)?.options.find((o) => o.id === approach);
      for (const id of option?.faultIds ?? []) {
        const fault = FAULTS.find((f) => f.id === id);
        if (fault && !out.some((f) => f.id === id)) out.push(fault);
      }
    }
  }

  // Overloading one person is its own failure mode, and it is earned rather
  // than dealt: it only becomes eligible when they have actually done it.
  const load = gateLoad(board);
  const overloaded = Object.entries(load).some(([personId, n]) => {
    const person = PERSON.get(personId);
    return person ? n > person.comfortableLoad : false;
  });
  const universal = FAULTS.find((f) => f.id === "arun-leave");
  if (overloaded && universal) out.push(universal);

  return out;
}

export function dealFault(board: Board): Fault | null {
  const pool = eligibleFaults(board);
  if (pool.length === 0) return null;
  const i = ((board.seat % pool.length) + pool.length) % pool.length;
  return pool[i];
}

/// A plan made entirely of hires and process changes cannot fail in any of the
/// scripted ways, which is itself worth saying out loud in the debrief.
export function faultlessBecause(board: Board): string | null {
  if (eligibleFaults(board).length > 0) return null;
  const chose = Object.values(board.picks).some((list) => list.length > 0);
  if (!chose) return "You have not committed to anything yet, so there is nothing to go wrong.";
  return "Nothing you built can fail in the ways this simulation models. You chose people and process over systems. That is a real strategy with a real cost — it is slower and it does not scale — but it is not fragile in these particular ways.";
}
