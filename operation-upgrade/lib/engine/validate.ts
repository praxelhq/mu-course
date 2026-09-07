import { PROBLEMS } from "@/lib/content/problems";
import { CONSTRAINTS, FAULT_QUESTIONS } from "@/lib/content/events";
import { DRILLS } from "@/lib/content/choices";
import { totals, constraintOf, resolveOption, changeCount } from "./economics";
import type { Board } from "./types";

export type Blocker = { code: string; text: string };

/// Everything standing between this student and showing Cutesh the plan,
/// written as sentences because the student reads them.
export function blockers(board: Board): Blocker[] {
  const out: Blocker[] = [];
  const t = totals(board);

  if (t.chosenCount === 0) {
    out.push({ code: "nothing-chosen", text: "You have not committed to fixing anything yet." });
  }
  const changes = changeCount(board);
  if (changes > 4) {
    out.push({ code: "too-many", text: `You are running ${changes} changes at once. Cutesh will fund four. Ninety days is not long enough for more.` });
  }
  if (t.overBy > 0) {
    out.push({ code: "over-budget", text: `You are ₹${t.overBy}L a year over what the board approved.` });
  }

  for (const p of PROBLEMS) {
    const approaches = board.picks[p.id] ?? [];
    if (approaches.length === 0) continue;
    for (const approach of approaches) {
      const r = resolveOption(p.id, approach, board);
      if (r.blocked) {
        out.push({ code: `blocked-${p.id}-${approach}`, text: `${r.title} is off the table — ${r.blockedWhy}. Choose something else for ${p.title.toLowerCase()}.` });
      }
    }
    if (!board.gates[p.id]) {
      out.push({ code: `gate-${p.id}`, text: `Nobody is named on ${p.title.toLowerCase()}. Cutesh wants to know who he is calling.` });
    }
    if (!board.rationales[p.id]) {
      out.push({ code: `why-${p.id}`, text: `Pick your reason for ${p.title.toLowerCase()}. It is the line that gets read out if your plan is chosen.` });
    }
  }

  if (!board.leaving) {
    out.push({ code: "no-rejection", text: "Name the problem you are deliberately leaving alone. Cutesh's fifth rule, and he will ask." });
  } else if (!board.leavingReason) {
    out.push({ code: "no-rejection-why", text: "Pick why you are leaving that one alone." });
  }

  const c = constraintOf(board);
  if (c) {
    if (!board.constraintMove) {
      out.push({ code: "constraint", text: `Decide what you do about ${c.title.toLowerCase()}.` });
    }
    if (c.effect.kind === "require-early" && t.landsBefore(c.effect.byWeek) === 0) {
      out.push({ code: "nothing-early", text: `Nothing in your plan helps anybody before week ${c.effect.byWeek}, and the board expects something at day thirty.` });
    }
    if (c.effect.kind === "max-builds" && t.buildCount > c.effect.n) {
      out.push({ code: "too-many-builds", text: `You have ${t.buildCount} new systems and you are allowed ${c.effect.n}. ${c.ask}` });
    }
    if (c.effect.kind === "require-obligation") {
      const ob = t.obligations.find((o) => o.id === (c.effect as { obligationId: string }).obligationId);
      if (ob && !ob.active) out.push({ code: "obligation", text: c.ask });
    }
  }

  if (board.faultId) {
    if (!board.faultDiagnosis) out.push({ code: "fault-diagnosis", text: "Say what actually broke." });
    if (!board.faultControl) out.push({ code: "fault-control", text: "Choose the control you are adding." });
    if (DRILLS[board.faultId] && board.drillOrder.length !== DRILLS[board.faultId].length) {
      out.push({ code: "fault-drill", text: "Put the response steps in the order you would actually do them." });
    }
    if (!board.ruling) out.push({ code: "ruling", text: "Decide whether that system keeps running, pauses, or stops." });
  }

  const h = board.headline;
  if (!h.opener || !h.middle || !h.closer) {
    out.push({ code: "headline", text: "Build the seventy-five seconds you would say to the board — three lines." });
  }

  return out;
}

export function canLock(board: Board): boolean {
  return blockers(board).length === 0;
}

export { CONSTRAINTS, FAULT_QUESTIONS };
