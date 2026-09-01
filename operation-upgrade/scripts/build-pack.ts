/**
 * Generates the printed pack from the same modules the app runs on, so the
 * paper a facilitator hands out and the screen a student reads can never
 * disagree. `pnpm pack` rewrites it; `tests/pack.test.ts` fails if the
 * committed pack is stale.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { COMPANY, FOUNDER_RULES, OPENING_LETTER, CAST } from "../lib/content/cast";
import { PROBLEMS, OBLIGATIONS } from "../lib/content/problems";
import { DOCUMENTS, QUESTIONS } from "../lib/content/documents";
import { CONSTRAINTS, FAULTS, FAULT_QUESTIONS, RULINGS } from "../lib/content/events";
import { PHASES } from "../lib/phases";
import { AI_RADAR } from "../lib/content/radar";

const FICTION =
  "Bharat Bites is a fictional company written for this session. Every person, policy, number, document and failure in this pack was invented for teaching, and none of it describes a real company, a real person or real money.";

function brief(): string {
  const L = [`# Bharat Bites — the case`, ``, `> ${FICTION}`, ``];
  L.push(`${COMPANY.outlets} outlets across ${COMPANY.cities} Indian cities. ${COMPANY.people} people. Founded in ${COMPANY.founded}.`, ``);
  L.push(`## The note Cutesh sent you`, ``);
  for (const p of OPENING_LETTER) L.push(p, ``);
  L.push(`— Cutesh Ramanohan, Founder and Managing Director`, ``);
  L.push(`## What she will not bend on`, ``);
  for (const r of FOUNDER_RULES) L.push(`${r.n}. ${r.text}`);
  L.push(``, `## What you have`, ``);
  L.push(`- **₹${COMPANY.budgetLakh} lakh a year**, for as long as your plan runs.`);
  L.push(`- **${COMPANY.days} days** until she presents to the board.`);
  L.push(`- **Four changes.** Not four problems — four changes. Two against one problem is allowed and is often the strongest move.`, ``);
  L.push(`## The people`, ``);
  for (const p of CAST) L.push(`- **${p.name}**, ${p.role.toLowerCase()}. ${p.note}`);
  return L.join("\n") + "\n";
}

function problems(): string {
  const L = [`# The seven problems, and what each one would cost to fix`, ``, `> ${FICTION}`, ``];
  for (const p of PROBLEMS) {
    L.push(`## ${p.area}. ${p.title}`, ``, p.pain, ``);
    L.push(`**What it costs this week**`, ``);
    for (const f of p.facts) L.push(`- ${f.value} — ${f.text}`);
    L.push(``, `**From the operations group**`, ``);
    for (const m of p.thread) {
      const who = CAST.find((c) => c.id === m.who)?.name ?? m.who;
      L.push(`> **${who}**, ${m.at} — “${m.text}”`);
    }
    L.push(``, `| Your options | Costs a year | Starts helping | Risk |`, `| --- | ---: | --- | --- |`);
    for (const o of p.options) {
      const kind = o.id === "hire" ? "Hire a person" : o.id === "build" ? "Build a system" : "Change the work";
      L.push(`| **${kind}** — ${o.title} | ₹${o.costLakh}L | Week ${o.liveWeek} | ${o.risk} |`);
    }
    L.push(`| **Leave it alone** | — | — | — |`, ``);
    for (const o of p.options) {
      L.push(`**${o.title}.** ${o.body} ${o.what}`, ``, `*${o.noteHead}:* ${o.noteBody}`, ``);
      if (o.discount) {
        const [rp, ra] = o.discount.requires.split(":");
        const other = PROBLEMS.find((x) => x.id === rp);
        L.push(`> **If you first choose “${other?.options.find((x) => x.id === ra)?.title}”** this drops to ₹${o.discount.costLakh}L a year and ${o.discount.risk} risk. ${o.discount.note}`, ``);
      }
    }
  }
  L.push(`## Two things Cutesh adds to your bill`, ``);
  for (const o of OBLIGATIONS) {
    L.push(`**${o.title}** — ₹${o.costLakh}L a year, from week ${o.liveWeek}. Triggered by: ${o.triggerText.toLowerCase()}.`, ``, o.activeText, ``);
  }
  return L.join("\n") + "\n";
}

function canvas(): string {
  const L = [`# The paper canvas`, ``, `> Use this if the room has no screens. It carries the whole exercise.`, ``, `Your name: ________________  Section: ____  Seat: ____`, ``];
  L.push(`## 1. Walk the seven`, ``, `For each one, write A for automate, U for augment, or H for keep human. Write a sentence on at least three.`, ``);
  L.push(`| | Problem | Your call | Why |`, `| --- | --- | :---: | --- |`);
  for (const p of PROBLEMS) L.push(`| ${p.area} | ${p.title} | ☐ A ☐ U ☐ H | |`);
  L.push(``, `## 2. Buy your four changes`, ``, `₹${COMPANY.budgetLakh} lakh a year. Four changes. Two against one problem is allowed.`, ``);
  L.push(`| Problem | Hire / Build / Change | What exactly | ₹L a year | Week it helps | Who checks it |`, `| --- | --- | --- | ---: | --- | --- |`);
  for (let i = 0; i < 4; i++) L.push(`| | | | | | |`);
  L.push(`| **Total** | | | **₹____L** | | |`, ``);
  L.push(`Anything you build that touches personal details, or a second system: add ₹4L each. Total must not exceed ₹${COMPANY.budgetLakh}L.`, ``);
  L.push(`## 3. Design the one that matters most`, ``, `Pick your lead change and fill in all nine. For the others, the last three lines are enough.`, ``);
  for (const q of ["What happens today", "What is slow, costly or stuck on one person", "Which capability you are using", "What information it needs, and whether that use is permitted", "The new way: what starts it, what the system does, what a person does, what comes out", "**Who checks it before it matters**", "**What observable improvement you expect**", "What could go wrong", "**What would prove it works**"]) {
    L.push(`**${q}**`, ``, `_______________________________________________`, ``);
  }
  L.push(`## 4. Your constraint card`, ``, `Card number ____ . What comes out of the plan, and why that one?`, ``, `_______________________________________________`, ``);
  L.push(`## 5. Your fault card`, ``, `Card number ____ .`, ``);
  for (const q of FAULT_QUESTIONS) L.push(`**${q.label}** _${q.hint}_`, ``, `_______________________________________________`, ``);
  L.push(`**Does it keep running?** ` + RULINGS.map((r) => `☐ ${r.label}`).join("  "), ``);
  L.push(`## 6. Seventy-five seconds to the board`, ``, `Between 25 and 80 words.`, ``, `_______________________________________________`, ``);
  L.push(`## 7. Deliberately not fixing`, ``, `Which problem, and why? Cutesh will ask.`, ``, `_______________________________________________`, ``);
  L.push(`## 8. Before you leave`, ``, `Three people, two newsletters, one podcast, three official feeds. Then:`, ``);
  L.push(`Within thirty days I will use AI to improve ______________________.`, ``, `The evidence it worked will be ______________________.`, ``);
  return L.join("\n") + "\n";
}

function cards(): string {
  const L = [`# Constraint and fault cards`, ``, `> Print, cut, and deal one constraint per student by seat so neighbours differ. Deal a fault only from something the student actually built.`, ``];
  L.push(`## Constraint cards`, ``);
  CONSTRAINTS.forEach((c, i) => {
    const from = CAST.find((p) => p.id === c.fromId)?.name ?? c.fromId;
    L.push(`### ${i + 1}. ${c.title}`, ``, `*${from}:* ${c.body}`, ``, `**What you must do:** ${c.ask}`, ``, `---`, ``);
  });
  L.push(`## Fault cards`, ``);
  FAULTS.forEach((f, i) => {
    const from = CAST.find((p) => p.id === f.reporterId)?.name ?? f.reporterId;
    const source = f.from === "*" ? "any plan where one person is named too often" : f.from;
    L.push(`### ${i + 1}. ${f.title}`, ``, `*Deal only to: ${source}*`, ``, `*${from}:* ${f.body}`, ``);
    L.push(`**Facilitator only — reveal after they have written their own answers.**`, ``);
    L.push(`- What failed: ${f.whatFailed}`);
    L.push(`- What would have prevented it: ${f.preventedBy}`);
    L.push(`- The point: ${f.teaches}`, ``, `---`, ``);
  });
  return L.join("\n") + "\n";
}

function shelf(): string {
  const L = [`# The company brain lab, on paper`, ``, `> ${FICTION}`, ``];
  L.push(`Twelve documents from Bharat Bites' Drive, WhatsApp and inbox. Decide which the assistant may read, then work out what it would answer.`, ``);
  L.push(`## The shelf`, ``);
  for (const d of DOCUMENTS) {
    L.push(`### ${d.title}`, ``, `*${d.source}*${d.badge ? ` — **${d.badge}**` : ""}`, ``);
    for (const line of d.excerpt) L.push(`> ${line}`);
    L.push(``, `☐ Index it   ☐ Leave it out`, ``);
  }
  L.push(`## The five questions store managers actually asked`, ``);
  QUESTIONS.forEach((q, i) => {
    const who = CAST.find((c) => c.id === q.asker)?.name ?? q.asker;
    L.push(`${i + 1}. **${who}:** “${q.text}”`, ``, `What would your assistant say, and which document would it say it from?`, ``, `_______________________________________________`, ``);
  });
  L.push(`## Facilitator answer key`, ``);
  for (const q of QUESTIONS) {
    L.push(`### “${q.text}”`, ``);
    for (const o of q.outcomes) {
      const cond = [
        ...(o.requires ?? []).map((r) => `has ${r}`),
        ...(o.excludes ?? []).map((r) => `no ${r}`),
      ].join(", ") || "otherwise";
      L.push(`- **${cond}** → *${o.verdict}*. ${o.lesson}`);
    }
    L.push(``);
  }
  return L.join("\n") + "\n";
}

function runSheet(): string {
  const L = [`# Run sheet`, ``, `Fourteen stages. You advance the room; nothing advances on a timer.`, ``];
  L.push(`| | Stage | Minutes | What you do |`, `| ---: | --- | ---: | --- |`);
  let total = 0;
  for (const p of PHASES) {
    if (p.id === "done") continue;
    total += p.minutes;
    L.push(`| ${p.n} | ${p.title} | ${p.minutes} | ${p.facilitator} |`);
  }
  L.push(`| | **Total** | **${total}** | |`, ``);
  L.push(`## If you are running late`, ``);
  L.push(`Protect the close and the company brain, in that order. Everything else can be shortened.`, ``);
  L.push(`- **Never cut:** the last stage. It is the only part students take with them.`);
  L.push(`- **Never rush:** the company brain. Every strong realisation in the session is in that ten minutes.`);
  L.push(`- **Cut first:** the number of pitches, from four to two.`);
  L.push(`- **Cut second:** walking all seven problems. Tell them to open three and decide from those.`, ``);
  L.push(`## If the screens fail`, ``);
  L.push(`Hand out the paper canvas and the card sheets. The exercise is identical — students deal their own constraint by seat number and you read the fault cards aloud. Nothing in the session depends on the app existing.`, ``);
  L.push(`## The two lines worth landing in the debrief`, ``);
  L.push(`1. **On the wall: how many named a human, and how many did not.** Ask the ones who did whether that person could actually do it on a Tuesday.`);
  L.push(`2. **On the wall: how many company brains would repeat something private.** Nobody set out to do that. They indexed a folder.`, ``);
  L.push(`## The take-home`, ``);
  L.push(`Three people, two newsletters, one podcast, three official feeds.`, ``);
  L.push(`- People: ${AI_RADAR.people.map((p) => p.name).join(", ")}.`);
  L.push(`- Newsletters: ${AI_RADAR.newsletters.map((n) => `${n.name} (${n.url})`).join(", ")}.`);
  L.push(`- Podcasts: ${AI_RADAR.podcasts.join(", ")}.`);
  for (const g of AI_RADAR.organisations) L.push(`- ${g.group}: ${g.names.join(", ")}.`);
  return L.join("\n") + "\n";
}

export const PACK: Record<string, () => string> = {
  "case-brief.md": brief,
  "the-seven-problems.md": problems,
  "paper-canvas.md": canvas,
  "cards.md": cards,
  "company-brain-lab.md": shelf,
  "run-sheet.md": runSheet,
};

if (process.argv[1]?.endsWith("build-pack.ts")) {
  const dir = join(process.cwd(), "pack");
  mkdirSync(dir, { recursive: true });
  for (const [name, make] of Object.entries(PACK)) {
    writeFileSync(join(dir, name), make(), "utf8");
    console.log(`wrote pack/${name}`);
  }
}
