import { PROBLEMS } from "@/lib/content/problems";
import { CONSTRAINTS } from "@/lib/content/events";
import { totals, constraintOf, resolveOption, changeCount } from "./economics";
import type { Board } from "./types";

export type Blocker = { code: string; text: string; fixable: boolean };

const words = (s: string) => s.trim().split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export const MIN_REASON_WORDS = 8;
export const MIN_CONSTRAINT_WORDS = 15;
export const MIN_FAULT_WORDS = 8;
export const MIN_HEADLINE_WORDS = 25;
export const MAX_HEADLINE_WORDS = 80;

/// Everything standing between this student and showing Meera the plan. Written
/// as sentences because the student reads them, not as codes.
export function blockers(board: Board): Blocker[] {
  const out: Blocker[] = [];
  const t = totals(board);

  if (t.chosenCount === 0) {
    out.push({ code: "nothing-chosen", text: "You have not committed to fixing anything yet.", fixable: true });
  }
  const changes = changeCount(board);
  if (changes > 4) {
    out.push({
      code: "too-many",
      text: `You are running ${changes} changes at once. Meera will fund four. Ninety days is not long enough for more.`,
      fixable: true,
    });
  }
  if (t.overBy > 0) {
    out.push({
      code: "over-budget",
      text: `You are ₹${t.overBy}L a year over what the board approved.`,
      fixable: true,
    });
  }

  for (const p of PROBLEMS) {
    const approaches = board.picks[p.id] ?? [];
    if (approaches.length === 0) continue;
    for (const approach of approaches) {
      const resolved = resolveOption(p.id, approach, board);
      if (resolved.blocked) {
        out.push({
          code: `blocked-${p.id}-${approach}`,
          text: `${resolved.title} is off the table — ${resolved.blockedWhy}. Choose something else for ${p.title.toLowerCase()}.`,
          fixable: true,
        });
      }
    }
    if (!board.gates[p.id]) {
      out.push({
        code: `gate-${p.id}`,
        text: `Nobody is named on ${p.title.toLowerCase()}. Meera's first rule: she wants to know who she is calling.`,
        fixable: true,
      });
    }
    if (words(board.reasons[p.id] ?? "") < MIN_REASON_WORDS) {
      out.push({
        code: `why-${p.id}`,
        text: `Say in one line why you chose that for ${p.title.toLowerCase()}. This is the sentence that gets read out.`,
        fixable: true,
      });
    }
  }

  if (!board.leaving) {
    out.push({
      code: "no-rejection",
      text: "Name the problem you are deliberately leaving alone. Meera's fifth rule, and she will ask.",
      fixable: true,
    });
  } else if (words(board.leavingWhy) < MIN_REASON_WORDS) {
    out.push({ code: "no-rejection-why", text: "Say why you are leaving that one alone.", fixable: true });
  }

  const c = constraintOf(board);
  if (c) {
    if (words(board.constraintResponse) < MIN_CONSTRAINT_WORDS) {
      out.push({
        code: "constraint",
        text: `Answer ${c.title.toLowerCase()} — what changes in your plan, and why that one.`,
        fixable: true,
      });
    }
    if (c.effect.kind === "require-early" && t.landsBefore(c.effect.byWeek) === 0) {
      out.push({
        code: "nothing-early",
        text: `Nothing in your plan helps anybody before week ${c.effect.byWeek}, and the board is expecting something at day thirty.`,
        fixable: true,
      });
    }
    if (c.effect.kind === "max-builds" && t.buildCount > c.effect.n) {
      out.push({
        code: "too-many-builds",
        text: `You have ${t.buildCount} new systems and you are allowed ${c.effect.n}. ${c.ask}`,
        fixable: true,
      });
    }
    if (c.effect.kind === "require-obligation") {
      const ob = t.obligations.find((o) => o.id === (c.effect as { obligationId: string }).obligationId);
      if (ob && !ob.active) {
        out.push({ code: "obligation", text: c.ask, fixable: true });
      }
    }
  }

  if (board.faultId) {
    for (const key of ["failed", "prevented", "control"]) {
      if (words(board.faultAnswers[key] ?? "") < MIN_FAULT_WORDS) {
        out.push({ code: `fault-${key}`, text: "Finish your answer on what went wrong and what you are adding.", fixable: true });
        break;
      }
    }
    if (!board.ruling) {
      out.push({ code: "ruling", text: "Decide whether that system keeps running, pauses, or stops.", fixable: true });
    }
  }

  const hw = words(board.headline);
  if (hw < MIN_HEADLINE_WORDS || hw > MAX_HEADLINE_WORDS) {
    out.push({
      code: "headline",
      text:
        hw === 0
          ? "Write the seventy-five seconds you would say to the board."
          : `Your board recommendation is ${hw} words. Aim for ${MIN_HEADLINE_WORDS} to ${MAX_HEADLINE_WORDS}.`,
      fixable: true,
    });
  }

  return out;
}

export function canLock(board: Board): boolean {
  return blockers(board).length === 0;
}

export { CONSTRAINTS };
