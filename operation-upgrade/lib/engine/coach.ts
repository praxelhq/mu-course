import { TROUBLES, type Trouble, type TroubleId } from "@/lib/content/rescue";
import { PERSON } from "@/lib/content/cast";
import { NEVER_INDEX } from "@/lib/content/documents";
import { totals, gateLoad, changeCount } from "./economics";
import { brainReport } from "./brain";
import type { Board } from "./types";

/// What is actually wrong with this plan, in the order it would hurt.
export function troubles(board: Board): Trouble[] {
  const t = totals(board);
  const found: TroubleId[] = [];

  if (changeCount(board) === 0) found.push("nothing-chosen");
  if (t.overBy > 0) found.push("over-budget");
  if (t.chosenCount > 0 && t.landsBefore(4) === 0) found.push("nothing-early");

  const builtOnMess = (board.picks.docs ?? []).includes("build") && !(board.picks.docs ?? []).includes("redesign");
  if (builtOnMess) found.push("built-on-mess");

  if (t.buildCount >= 3) found.push("ai-everywhere");

  const brain = brainReport(board.indexed, board.asked);
  if (NEVER_INDEX.some((id) => board.indexed.includes(id)) || brain.harmful > 0) found.push("brain-unsafe");

  const load = gateLoad(board);
  const overloaded = Object.entries(load).some(([id, n]) => n > (PERSON.get(id)?.comfortableLoad ?? 1));
  if (overloaded) found.push("one-person");

  if (t.chosenCount > 0 && !board.leaving) found.push("no-rejection");

  return found.map((id) => TROUBLES[id]);
}

/// Mariga is brought in when a plan is genuinely in trouble, not when it is
/// merely imperfect. Two problems is a wobble; three is a programme the board
/// would actually intervene in.
export function needsRescue(board: Board): boolean {
  const list = troubles(board);
  if (list.length >= 3) return true;
  // Any one of these alone is enough to justify somebody stepping in.
  return list.some((t) => t.id === "over-budget" || t.id === "brain-unsafe" || t.id === "nothing-chosen");
}

/// Even a strong plan gets two things pressed on. Nobody leaves unchallenged.
export function pressOn(board: Board): string[] {
  const t = totals(board);
  const out: string[] = [];
  if (t.remainingLakh > 20) out.push(`You left ₹${t.remainingLakh}L of ₹${t.budgetLakh}L unspent. That is allowed. Can you say what you would buy with it if Cutesh handed it back tomorrow?`);
  if (t.buildCount === 0) out.push("You built nothing at all. Process changes do not scale past about twenty-five outlets, and this company intends to grow. What is the first thing you would automate next year?");
  if (board.asked.length < 3) out.push("You did not test the assistant on most of the questions store managers actually ask. What would you have had to see before you told Priya to trust it?");
  if (!board.leaving) out.push("You have not said what you are deliberately leaving alone. Cutesh will ask.");
  const load = gateLoad(board);
  const busiest = Object.entries(load).sort((a, b) => b[1] - a[1])[0];
  if (busiest && busiest[1] >= 2) out.push(`${PERSON.get(busiest[0])?.name} is on ${busiest[1]} of your systems. Who covers them when they are away?`);
  // Nobody leaves without two questions, however good the plan is.
  const spares = [
    "What did you assume about this company that you never actually checked?",
    "If Cutesh doubled the budget tomorrow, what would you buy — and why is it not already in here?",
    "Which of your changes would you drop first if you had to lose one on Monday?",
  ];
  for (const spare of spares) {
    if (out.length >= 2) break;
    out.push(spare);
  }
  return out.slice(0, 2);
}
