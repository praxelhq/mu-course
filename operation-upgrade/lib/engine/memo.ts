import { PROBLEM, PROBLEMS } from "@/lib/content/problems";
import { PERSON } from "@/lib/content/cast";
import { FAULT, RULINGS } from "@/lib/content/events";
import { RATIONALES, LEAVING_REASONS, CONSTRAINT_MOVES, FAULT_DIAGNOSIS, FAULT_CONTROLS, FALLBACKS, HEADLINE_OPENERS, HEADLINE_MIDDLES, HEADLINE_CLOSERS, COMMITMENT_TARGETS, COMMITMENT_EVIDENCE } from "@/lib/content/choices";
import { chosenOptions, totals, constraintOf } from "./economics";
import { brainReport } from "./brain";
import type { Board } from "./types";

const APPROACH_WORD: Record<string, string> = {
  hire: "Hired a person",
  build: "Built a system",
  redesign: "Changed how the work happens",
};

/// The one page the student takes away. Composed from what they actually did,
/// so it cannot say anything they did not decide.
export function composeMemo(board: Board): string {
  const t = totals(board);
  const chosen = chosenOptions(board);
  const c = constraintOf(board);
  const fault = board.faultId ? FAULT.get(board.faultId) : null;
  const ruling = RULINGS.find((r) => r.id === board.ruling);
  const brain = brainReport(board.indexed, board.asked);

  const L: string[] = [];
  L.push(`# Ninety days at Bharat Bites`);
  L.push(``);
  L.push(`**${board.handle}** · prepared for Cutesh Ramanohan, founder and managing director`);
  L.push(``);
  L.push(`---`);
  L.push(``);
  L.push(`## What I am changing, and what it costs`);
  L.push(``);
  L.push(`₹${t.spendLakh} lakh a year of the ₹${t.budgetLakh} lakh approved, across ${t.chosenCount} ${t.chosenCount === 1 ? "change" : "changes"}.`);
  L.push(``);

  for (const o of chosen) {
    const problem = PROBLEM.get(o.problemId)!;
    const person = PERSON.get(board.gates[o.problemId] ?? "");
    L.push(`### ${problem.title}`);
    L.push(``);
    L.push(`**${APPROACH_WORD[o.approach]} — ${o.title}**`);
    L.push(``);
    L.push(`- Costs ₹${o.costLakh} lakh a year, starts helping in week ${o.liveWeek}.`);
    L.push(`- ${person ? `${person.name}, ${person.role.toLowerCase()}, is the person who checks it.` : "Nobody is named on this yet."}`);
    if (o.discounted && o.discountNote) L.push(`- Cheaper and safer than it would have been: ${o.discountNote}`);
    const why = RATIONALES.find((r) => r.id === board.rationales[o.problemId]);
    if (why) L.push(`- Why: ${why.text}`);
    L.push(``);
  }

  const active = t.obligations.filter((o) => o.active);
  if (active.length > 0) {
    L.push(`### What comes with it`);
    L.push(``);
    for (const o of active) L.push(`- **${o.title}** — ₹${o.costLakh} lakh a year. ${o.text}`);
    L.push(``);
  }

  if (board.leaving) {
    const left = PROBLEM.get(board.leaving);
    L.push(`## What I am deliberately not fixing`);
    L.push(``);
    const lr = LEAVING_REASONS.find((r) => r.id === board.leavingReason);
    L.push(`**${left?.title ?? board.leaving}.** ${lr?.text ?? ""}`);
    L.push(``);
  }

  if (board.indexed.length > 0 || board.asked.length > 0) {
    L.push(`## What I taught the company brain`);
    L.push(``);
    L.push(`${board.indexed.length} documents indexed. Tested on ${brain.asked} of the five questions store managers actually ask.`);
    if (brain.harmful > 0) {
      L.push(``);
      L.push(`${brain.harmful} of those answers would have caused a problem if a store manager had acted on them. I found that out on the bench rather than in a shop.`);
    } else if (brain.asked > 0) {
      L.push(``);
      L.push(`Every question I tested came back either correct or refused. Nothing it said would have got a store manager into trouble.`);
    }
    L.push(``);
  }

  if (c) {
    L.push(`## What changed under me`);
    L.push(``);
    const move = (CONSTRAINT_MOVES[c.id] ?? []).find((m) => m.id === board.constraintMove);
    L.push(`**${c.title}.** ${move?.text ?? ""}`);
    L.push(``);
  }

  if (fault) {
    L.push(`## What went wrong, and what I did`);
    L.push(``);
    L.push(`**${fault.title}.**`);
    L.push(``);
    const diag = (FAULT_DIAGNOSIS[fault.id] ?? []).find((d) => d.id === board.faultDiagnosis);
    const ctrl = (FAULT_CONTROLS[fault.id] ?? []).find((d) => d.id === board.faultControl);
    const back = (FALLBACKS[fault.id] ?? []).find((d) => d.id === board.faultFallback);
    if (diag) L.push(`- What failed: ${diag.text}`);
    if (ctrl) L.push(`- The control I am adding: ${ctrl.text}`);
    if (back) L.push(`- What happens when it is down: ${back.text}`);
    if (ruling) L.push(`- My ruling: **${ruling.label.toLowerCase()}** — ${ruling.sub.toLowerCase()}`);
    L.push(``);
  }

  L.push(`## What I would say to the board, in seventy-five seconds`);
  L.push(``);
  const opener = HEADLINE_OPENERS.find((x) => x.id === board.headline.opener);
  const middle = HEADLINE_MIDDLES.find((x) => x.id === board.headline.middle);
  const closer = HEADLINE_CLOSERS.find((x) => x.id === board.headline.closer);
  L.push([opener?.text, middle?.text, closer?.text].filter(Boolean).join(" "));
  L.push(``);

  const target = COMMITMENT_TARGETS.find((x) => x.id === board.commitment.target);
  const evidence = COMMITMENT_EVIDENCE.find((x) => x.id === board.commitment.evidence);
  if (target && evidence) {
    L.push(`---`);
    L.push(``);
    L.push(`*Within thirty days I will use AI to improve ${target.text}. The evidence that it worked will be ${evidence.text}.*`);
    L.push(``);
  }

  L.push(`---`);
  L.push(``);
  L.push(`Bharat Bites is a fictional company built for this session. Every person, policy, number and failure above was invented for teaching.`);

  return L.join("\n");
}

/// The seventy-five seconds, as one sentence. Used on the wall, the ballot and
/// the pitch list, so all three always say exactly the same thing.
export function headlineText(board: Board): string {
  const opener = HEADLINE_OPENERS.find((x) => x.id === board.headline.opener);
  const middle = HEADLINE_MIDDLES.find((x) => x.id === board.headline.middle);
  const closer = HEADLINE_CLOSERS.find((x) => x.id === board.headline.closer);
  return [opener?.text, middle?.text, closer?.text].filter(Boolean).join(" ");
}

/// The one-line shape of a plan, for the wall and the pitch list.
export function planShape(board: Board): { hire: number; build: number; redesign: number } {
  const shape = { hire: 0, build: 0, redesign: 0 };
  for (const p of PROBLEMS) {
    for (const approach of board.picks[p.id] ?? []) shape[approach] += 1;
  }
  return shape;
}
