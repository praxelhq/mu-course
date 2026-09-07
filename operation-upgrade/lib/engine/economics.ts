import { CONSTRAINTS, type Constraint } from "@/lib/content/events";
import { OBLIGATIONS, PROBLEM, PROBLEMS, obligationTriggered, type Approach } from "@/lib/content/problems";
import { COMPANY } from "@/lib/content/cast";
import type { Board, ResolvedOption, Totals } from "./types";

export function constraintOf(board: Board): Constraint | null {
  if (!board.constraintId) return null;
  return CONSTRAINTS.find((c) => c.id === board.constraintId) ?? null;
}

export function budgetOf(board: Board): number {
  const c = constraintOf(board);
  if (c && c.effect.kind === "budget") return c.effect.lakh;
  return COMPANY.budgetLakh;
}

/// What an option costs *this student*, once their own earlier choices and
/// their own constraint card are taken into account. This is where the
/// sequencing lesson lives: clean the library first and the brain gets cheaper.
export function resolveOption(problemId: string, approach: Approach, board: Board): ResolvedOption {
  const problem = PROBLEM.get(problemId);
  const option = problem?.options.find((o) => o.id === approach);
  if (!problem || !option) throw new Error(`unknown option ${problemId}:${approach}`);

  let costLakh = option.costLakh;
  let liveWeek = option.liveWeek;
  let risk = option.risk;
  let discounted = false;
  let discountNote: string | null = null;
  let penalised = false;
  let blocked = false;
  let blockedWhy: string | null = null;

  if (option.discount) {
    const [reqProblem, reqApproach] = option.discount.requires.split(":");
    if ((board.picks[reqProblem] ?? []).includes(reqApproach as Approach)) {
      costLakh = option.discount.costLakh;
      risk = option.discount.risk;
      discounted = true;
      discountNote = option.discount.note;
    }
  }

  const c = constraintOf(board);
  if (c) {
    const e = c.effect;
    if (e.kind === "cost-penalty" && e.problemId === problemId && e.approach === approach) {
      costLakh += e.addLakh;
      liveWeek += e.addWeeks;
      penalised = true;
    }
    if (e.kind === "ban-approach" && e.problemId === problemId && e.approach === approach) {
      blocked = true;
      blockedWhy = c.title;
    }
  }

  return {
    problemId, approach, title: option.title,
    costLakh, liveWeek, risk, discounted, discountNote, penalised, blocked, blockedWhy,
  };
}

export function chosenOptions(board: Board): ResolvedOption[] {
  return PROBLEMS.flatMap((p) =>
    (board.picks[p.id] ?? []).map((approach) => resolveOption(p.id, approach, board)),
  );
}

/// Every change counts against the cap of four, including two against one
/// problem. Ninety days is the constraint, not the number of problems touched.
export function changeCount(board: Board): number {
  return Object.values(board.picks).reduce((n, list) => n + list.length, 0);
}

export function totals(board: Board): Totals {
  const chosen = chosenOptions(board);
  const budgetLakh = budgetOf(board);

  const byApproach: Record<Approach, number> = { hire: 0, build: 0, redesign: 0 };
  let spendLakh = 0;
  for (const o of chosen) {
    byApproach[o.approach] += o.costLakh;
    spendLakh += o.costLakh;
  }

  const obligations = OBLIGATIONS.map((o) => {
    const forced =
      constraintOf(board)?.effect.kind === "require-obligation" &&
      (constraintOf(board)!.effect as { obligationId: string }).obligationId === o.id;
    const active = obligationTriggered(o.id, board.picks) || Boolean(forced);
    if (active) spendLakh += o.costLakh;
    return {
      id: o.id, title: o.title, costLakh: o.costLakh, active,
      text: active ? o.activeText : o.dormantText,
    };
  });

  const weeks = chosen.map((o) => o.liveWeek);
  const earliestWeek = weeks.length ? Math.min(...weeks) : null;

  return {
    budgetLakh,
    spendLakh,
    remainingLakh: budgetLakh - spendLakh,
    overBy: Math.max(0, spendLakh - budgetLakh),
    byApproach,
    chosenCount: chosen.length,
    buildCount: chosen.filter((o) => o.approach === "build").length,
    obligations,
    earliestWeek,
    landsBefore: (week: number) => chosen.filter((o) => o.liveWeek <= week).length,
  };
}

/// How many systems each named person is accountable for. The number that
/// quietly tells a student they have rebuilt the problem they were hired to fix.
export function gateLoad(board: Board): Record<string, number> {
  const load: Record<string, number> = {};
  for (const [problemId, personId] of Object.entries(board.gates)) {
    if ((board.picks[problemId] ?? []).length === 0) continue;
    load[personId] = (load[personId] ?? 0) + 1;
  }
  return load;
}
