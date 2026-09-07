/**
 * Ten students playing at once against a live instance, while a facilitator
 * drives the room. Sixty will do this on the day; this is the rehearsal that
 * finds what only breaks when people arrive together.
 *
 *   pnpm simulate <base-url> <section> <facilitator-key> [players]
 */

import { dealConstraint, dealFault } from "@/lib/engine/deal";
import { correctDrillOrder, shuffledDrill } from "@/lib/engine/score";
import { FAULT_DIAGNOSIS, FAULT_CONTROLS, FALLBACKS, CONSTRAINT_MOVES } from "@/lib/content/choices";
import { emptyBoard, type Board } from "@/lib/engine/types";

const BASE = process.argv[2] ?? "http://localhost:3400";
const SECTION = (process.argv[3] ?? "G").toUpperCase();
const KEY = process.argv[4] ?? "rehearsal";
const N = Number(process.argv[5] ?? 10);

type Result = { ok: boolean; status: number; ms: number; body: unknown; label: string };
const results: Result[] = [];
const problems: string[] = [];

async function call(label: string, path: string, init?: RequestInit): Promise<Result> {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep the text */ }
    const r = { ok: res.ok, status: res.status, ms: Date.now() - started, body, label };
    results.push(r);
    return r;
  } catch (e) {
    const r = { ok: false, status: 0, ms: Date.now() - started, body: String(e), label };
    results.push(r);
    return r;
  }
}

const control = (action: string, extra: Record<string, unknown> = {}) =>
  call(`control:${action}`, "/api/instructor/control", {
    method: "POST",
    body: JSON.stringify({ key: KEY, section: SECTION, action, ...extra }),
  });

const FIRST = ["Ananya", "Vikram", "Priya", "Rohan", "Isha", "Karthik", "Meghna", "Arjun", "Divya", "Siddharth",
  "Naina", "Farhan", "Tara", "Aditya", "Zoya", "Nikhil", "Riya", "Kabir", "Anushka", "Dev"];
const INITIAL = "RSKMTNBPLGCAVJHDWFEQ";
const names = Array.from({ length: 200 }, (_, i) => `${FIRST[i % FIRST.length]} ${INITIAL[Math.floor(i / FIRST.length) % INITIAL.length]}`);

type Player = { handle: string; secret: string; seat: number; board: Board };

/// Four strategies the room actually produces, so the wall aggregates over a
/// real spread rather than sixty copies of one plan. Seat 2 deliberately
/// chooses only people, which is the one shape no scripted fault can land on.
const ARCHETYPES = [
  {
    name: "sequenced",
    picks: { docs: ["redesign", "build"], reporting: ["redesign"], analytics: ["redesign"] },
    gates: { docs: "arun", reporting: "sunita", analytics: "sneha" },
    rationales: { docs: "prerequisite", reporting: "cheapest-pain", analytics: "fastest" },
    indexed: ["allergen26", "refunds", "catering", "opening", "hygiene"],
    leaving: "hiring", leavingReason: "no-trading-impact",
    headline: { opener: "o-ground", middle: "m-sequence", closer: "c-cost" },
  },
  {
    name: "ai-everywhere",
    picks: { docs: ["build"], calls: ["build"], marketing: ["build"], website: ["build"] },
    gates: { docs: "arun", calls: "arun", marketing: "arun", website: "arun" },
    rationales: { docs: "scales", calls: "scales", marketing: "fastest", website: "asked-for" },
    indexed: ["allergen26", "allergen24", "refunds", "catering"],
    leaving: "analytics", leavingReason: "wrong-tool",
    headline: { opener: "o-speed", middle: "m-scale", closer: "c-evidence" },
  },
  {
    name: "all-people",
    picks: { docs: ["hire"], calls: ["hire"], hiring: ["hire"], reporting: ["hire"] },
    gates: { docs: "arun", calls: "priya", hiring: "rahul", reporting: "sunita" },
    rationales: { docs: "single-point", calls: "cheapest-pain", hiring: "asked-for", reporting: "fastest" },
    indexed: ["allergen26", "refunds"],
    leaving: "website", leavingReason: "downstream",
    headline: { opener: "o-people", middle: "m-gate", closer: "c-human" },
  },
  {
    name: "built-on-the-mess",
    picks: { docs: ["build"], calls: ["build"] },
    gates: { docs: "arun", calls: "arun" },
    rationales: { docs: "fastest", calls: "scales" },
    indexed: ["allergen26", "allergen24", "payroll", "complaint"],
    leaving: "marketing", leavingReason: "ran-out",
    headline: { opener: "o-cheap", middle: "m-boring", closer: "c-refuse" },
  },
] as const;

const pick = <T,>(list: readonly T[], seat: number): T | undefined => list.length ? list[seat % list.length] : undefined;
const strongest = (list: readonly { id: string; quality: string }[] | undefined, seat: number) => {
  const strong = (list ?? []).filter((o) => o.quality === "strong");
  return pick(strong.length ? strong : (list ?? []), seat)?.id ?? null;
};

/// depth 0-6 walks a student forward through the stages, so a sync mid-session
/// carries a half-finished board exactly as a real laptop would.
function boardFor(handle: string, seat: number, depth: number): Board {
  const a = ARCHETYPES[seat % ARCHETYPES.length];
  const b = emptyBoard(handle, seat);

  b.visited = ["docs", "calls", "reporting", "analytics"].slice(0, Math.min(4, depth + 1));
  if (depth < 1) return b;

  b.picks = a.picks as unknown as Board["picks"];
  b.gates = { ...a.gates };
  b.rationales = { ...a.rationales };
  if (depth < 2) return b;

  b.indexed = [...a.indexed];
  b.asked = ["nuts", "refund", "salary", "autorefund", "catering"];
  if (depth < 3) return b;

  const constraint = dealConstraint(seat);
  b.constraintId = constraint.id;
  b.constraintMove = strongest(CONSTRAINT_MOVES[constraint.id], seat);
  if (depth < 4) return b;

  // Half the room drills in the right order and half does not, so the scoring
  // path that tells them what a slip costs is exercised too.
  const fault = dealFault(b);
  if (fault) {
    b.faultId = fault.id;
    b.faultDiagnosis = strongest(FAULT_DIAGNOSIS[fault.id], seat);
    b.faultControl = strongest(FAULT_CONTROLS[fault.id], seat);
    b.faultFallback = strongest(FALLBACKS[fault.id], seat);
    b.drillOrder = seat % 2 === 0 ? correctDrillOrder(fault.id) : shuffledDrill(fault.id, seat);
    b.ruling = (["continue", "pause", "stop"] as const)[seat % 3];
  }
  if (depth < 5) return b;

  b.leaving = a.leaving;
  b.leavingReason = a.leavingReason;
  b.headline = { ...a.headline };
  if (depth < 6) return b;

  b.radar = ["r-one", "r-two"];
  b.commitment = { target: "t-recurring", evidence: "e-time" };
  return b;
}

function pct(ns: number[], p: number): number {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function main() {
  console.log(`\n  ${N} students, section ${SECTION}, against ${BASE}\n`);

  // Clear the section so the run starts from a known state.
  await control("reset");
  await control("goto", { phase: "offer" });

  // ── everybody arrives at once ────────────────────────────────────────────
  console.log("  1. Ten laptops hit join in the same second");
  const joins = await Promise.all(
    names.slice(0, N).map((handle, i) =>
      call("join", "/api/join", {
        method: "POST",
        body: JSON.stringify({ code: `bharat-${SECTION.toLowerCase()}`, handle, secret: `secret-${i}`.padEnd(16, "0") }),
      }),
    ),
  );

  const players: Player[] = [];
  joins.forEach((r, i) => {
    const b = r.body as { seat?: number; error?: string };
    if (!r.ok) problems.push(`join failed for ${names[i]}: HTTP ${r.status} — ${JSON.stringify(r.body)}`);
    else players.push({ handle: names[i], secret: `secret-${i}`.padEnd(16, "0"), seat: b.seat ?? -1, board: emptyBoard(names[i], b.seat ?? -1) });
  });
  const seats = players.map((p) => p.seat);
  if (new Set(seats).size !== seats.length) {
    problems.push(`seats collided: ${JSON.stringify(seats)} — cards would be dealt identically to different students`);
  }
  console.log(`     ${players.length}/${N} in · seats ${JSON.stringify(seats)}`);

  // ── everyone plays while the facilitator drives ──────────────────────────
  console.log("  2. Everyone works while the facilitator moves the ceiling");
  const until = Date.now() + 22_000;
  const play = players.map(async (p, i) => {
    let depth = 0;
    while (Date.now() < until) {
      depth = Math.min(6, depth + (Math.random() > 0.45 ? 1 : 0));
      p.board = boardFor(p.handle, p.seat, depth);
      await Promise.all([
        call("sync", "/api/sync", {
          method: "POST",
          body: JSON.stringify({
            sectionCode: SECTION, handle: p.handle, secret: p.secret,
            board: p.board, stage: ["walk", "decide", "brain", "plan", "constraint", "fault", "review"][depth], locked: false,
          }),
        }),
        call("room", `/api/room?section=${SECTION}`),
      ]);
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 700 + i * 20));
    }
  });

  const drive = (async () => {
    for (const phase of ["walk", "decide", "brain", "plan", "constraint", "fault", "review"]) {
      await new Promise((r) => setTimeout(r, 2200));
      await control("goto", { phase });
      await call("instructor", `/api/instructor/state?key=${encodeURIComponent(KEY)}&section=${SECTION}`);
    }
  })();

  const wall = (async () => {
    while (Date.now() < until) {
      await call("wall", `/api/instructor/state?key=${encodeURIComponent(KEY)}&section=${SECTION}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();

  await Promise.all([...play, drive, wall]);

  // ── everybody locks at once ──────────────────────────────────────────────
  console.log("  3. Everyone locks their plan in the same minute");
  await control("goto", { phase: "memo" });
  await Promise.all(players.map((p) =>
    call("lock", "/api/sync", {
      method: "POST",
      body: JSON.stringify({
        sectionCode: SECTION, handle: p.handle, secret: p.secret,
        board: { ...boardFor(p.handle, p.seat, 6), lockedAt: new Date().toISOString() },
        stage: "memo", locked: true,
      }),
    }),
  ));

  if (players.length === 0) {
    console.log("\n  Nobody got in. Nothing else can be tested.\n");
    for (const f of results.filter((r) => !r.ok).slice(0, 3)) {
      console.log(`  FAILED ${f.label} → HTTP ${f.status} ${JSON.stringify(f.body)}`);
    }
    await control("reset");
    process.exit(1);
  }

  // A locked plan must stop accepting writes.
  const afterLock = await call("sync-after-lock", "/api/sync", {
    method: "POST",
    body: JSON.stringify({
      sectionCode: SECTION, handle: players[0].handle, secret: players[0].secret,
      board: { ...boardFor(players[0].handle, players[0].seat, 6), leaving: "TAMPERED AFTER LOCK" },
      stage: "memo", locked: true,
    }),
  });
  if ((afterLock.body as { saved?: boolean }).saved !== false) {
    problems.push("a locked plan still accepted a write — a student could edit after signing");
  }

  // ── the ballot ───────────────────────────────────────────────────────────
  console.log("  4. Four pitch, everybody votes at once");
  const pitchers = players.slice(0, 4);
  await Promise.all(pitchers.map((p) => control("pitch", { handle: p.handle })));
  await control("goto", { phase: "vote" });

  const votes = await Promise.all(players.map((p, i) => {
    const target = pitchers[(i + 1) % pitchers.length];
    const votedFor = target.handle === p.handle ? pitchers[(i + 2) % pitchers.length].handle : target.handle;
    return call("vote", "/api/vote", {
      method: "POST",
      body: JSON.stringify({ sectionCode: SECTION, handle: p.handle, secret: p.secret, votedFor }),
    });
  }));
  const failedVotes = votes.filter((v) => !v.ok);
  if (failedVotes.length) problems.push(`${failedVotes.length} votes rejected: ${JSON.stringify(failedVotes[0].body)}`);

  // Nobody funds themselves.
  const selfVote = await call("self-vote", "/api/vote", {
    method: "POST",
    body: JSON.stringify({ sectionCode: SECTION, handle: pitchers[0].handle, secret: pitchers[0].secret, votedFor: pitchers[0].handle }),
  });
  if (selfVote.ok) problems.push("a student was allowed to fund their own plan");

  // Somebody else's secret must not move your vote.
  const forged = await call("forged-vote", "/api/vote", {
    method: "POST",
    body: JSON.stringify({ sectionCode: SECTION, handle: players[1].handle, secret: "wrong-secret-000", votedFor: pitchers[0].handle }),
  });
  if (forged.ok) problems.push("a vote was accepted with the wrong secret");

  // ── what the room ended up with ──────────────────────────────────────────
  const final = await call("final", `/api/instructor/state?key=${encodeURIComponent(KEY)}&section=${SECTION}`);
  type View = {
    joined: number; locked: number; votesCast: number;
    mix: { hire: number; build: number; redesign: number };
    spend: { median: number; min: number; max: number };
    attention: { id: string; touched: number; left: number }[];
    gates: { named: number; unnamed: number; onOnePerson: { name: string; count: number } | null };
    brain: { tested: number; leaked: number; wrong: number; clean: number };
    rulings: { continue: number; pause: number; stop: number };
    pitches: { handle: string; headline: string; shape: { hire: number; build: number; redesign: number } }[];
  };
  const body = final.body as { view?: View; spread?: Record<string, number> };
  const v = body.view;
  console.log(`     joined ${v?.joined} · locked ${v?.locked} · votes ${v?.votesCast} · on the ballot ${v?.pitches?.length}`);
  console.log(`     spread ${JSON.stringify(body.spread)}`);

  if (v?.joined !== players.length) problems.push(`the room reports ${v?.joined} students but ${players.length} joined`);
  if (v?.locked !== players.length) problems.push(`${v?.locked} of ${players.length} plans locked`);
  if (v?.votesCast !== players.length) problems.push(`${v?.votesCast} of ${players.length} votes counted`);

  // ── the wall must reflect what was actually played ───────────────────────
  // Plumbing can be perfectly healthy while every board is being dropped on
  // the floor — a version bump alone is enough to do it, silently. These are
  // the assertions that notice.
  console.log("  5. The wall reflects the plans, not just the connections");
  if (!v) {
    problems.push("the instructor state returned no room view at all");
  } else {
    const changes = v.mix.hire + v.mix.build + v.mix.redesign;
    console.log(`     mix ${JSON.stringify(v.mix)} · spend ${JSON.stringify(v.spend)} · brain ${JSON.stringify(v.brain)}`);
    console.log(`     gates named ${v.gates.named}/${v.gates.named + v.gates.unnamed} · busiest ${v.gates.onOnePerson?.name ?? "—"} (${v.gates.onOnePerson?.count ?? 0}) · rulings ${JSON.stringify(v.rulings)}`);

    if (changes === 0) problems.push("the wall counted zero changes across the whole room — every board is being discarded, most likely a version mismatch");
    if (v.mix.hire === 0 || v.mix.build === 0 || v.mix.redesign === 0) problems.push(`the wall is missing a whole approach: ${JSON.stringify(v.mix)}`);
    if (v.spend.median <= 0) problems.push("median spend came back as zero, so no plan is being priced");
    if (v.spend.max <= v.spend.min) problems.push(`every plan costs the same (${v.spend.min}L) — the spread the debrief needs is not there`);
    if (v.brain.tested !== players.length) problems.push(`${v.brain.tested} of ${players.length} students registered as having tested the brain`);
    if (v.brain.leaked === 0) problems.push("nobody registered as having indexed payroll, but a quarter of the room did — the leak count is not working");
    if (v.brain.clean === 0) problems.push("nobody registered a clean brain, but a quarter of the room had one");
    if (v.gates.named === 0) problems.push("nobody registered as having named a person, which is the debrief's first line");
    if (!v.gates.onOnePerson) problems.push("the busiest-person count is empty, which is the debrief's second line");

    const ruled = v.rulings.continue + v.rulings.pause + v.rulings.stop;
    if (ruled === 0) problems.push("no rulings counted — the fault stage is not reaching the wall");

    const touched = v.attention.filter((a) => a.touched > 0).length;
    const left = v.attention.filter((a) => a.left > 0).length;
    if (touched < 4) problems.push(`only ${touched} of seven problems registered any attention`);
    if (left === 0) problems.push("nobody registered as deliberately leaving a problem alone, which is the fifth rule");

    const mute = v.pitches.filter((p) => !p.headline || p.headline.trim().length === 0);
    if (mute.length) problems.push(`${mute.length} of ${v.pitches.length} pitches reached the ballot with an empty headline — the wall would show a blank card`);
    const shapeless = v.pitches.filter((p) => (p.shape.hire + p.shape.build + p.shape.redesign) === 0);
    if (shapeless.length) problems.push(`${shapeless.length} pitches carry no plan shape`);
    if (v.pitches.length) console.log(`     top pitch “${v.pitches[0].headline.slice(0, 72)}…”`);
  }

  // ── one bad board must not take the room down ────────────────────────────
  // Boards are client-authored JSON stored verbatim. A half-written one, or one
  // left over from a previous build, must never 500 the console, the wall or
  // the ballot — that would blind the facilitator in front of sixty students.
  console.log("  6. One student's broken board does not take the room down");
  const victim = players[players.length - 1];
  const junk: [string, unknown][] = [
    ["a board from the previous build", { v: 1, handle: victim.handle, seat: 999, picks: { docs: ["build"] }, headline: "an old free-text headline" }],
    ["a v2 board with nothing in it", { v: 2 }],
    ["a v2 board with no picks", { v: 2, handle: victim.handle, seat: victim.seat }],
    ["a v2 board with fields of the wrong type", { v: 2, picks: "docs", gates: 7, indexed: null, headline: "free text", commitment: null }],
  ];

  await control("pitch", { handle: victim.handle });
  for (const [what, board] of junk) {
    await call("junk-board", "/api/sync", {
      method: "POST",
      body: JSON.stringify({ sectionCode: SECTION, handle: victim.handle, secret: victim.secret, board, stage: "memo", locked: false }),
    });
    const console_ = await call("after-junk:console", `/api/instructor/state?key=${encodeURIComponent(KEY)}&section=${SECTION}`);
    const ballot = await call("after-junk:ballot", `/api/ballot?section=${SECTION}&handle=${encodeURIComponent(victim.handle)}`);
    const room = await call("after-junk:room", `/api/room?section=${SECTION}`);
    if (!console_.ok) problems.push(`${what} took the instructor console down (HTTP ${console_.status}) — the facilitator and the projector both go blind`);
    if (!ballot.ok) problems.push(`${what} took the ballot down (HTTP ${ballot.status}) — the room could not vote`);
    if (!room.ok) problems.push(`${what} took the student room endpoint down (HTTP ${room.status})`);

    const sv = (console_.body as { view?: View }).view;
    if (sv?.pitches.some((p) => p.headline === "an old free-text headline")) {
      problems.push(`${what} was read as if it were a current plan`);
    }
    // Everybody else must still be counted.
    if (console_.ok && sv && sv.joined !== players.length) {
      problems.push(`${what} changed the room count to ${sv.joined} of ${players.length}`);
    }
  }
  console.log(`     four broken boards survived · console, ballot and room all still answering`);

  // ── report ───────────────────────────────────────────────────────────────
  const byLabel = new Map<string, number[]>();
  let errors = 0;
  for (const r of results) {
    if (!byLabel.has(r.label)) byLabel.set(r.label, []);
    byLabel.get(r.label)!.push(r.ms);
    if (!r.ok && !["self-vote", "forged-vote", "sync-after-lock"].includes(r.label)) errors += 1;
  }

  console.log(`\n  ${results.length} requests, ${errors} unexpected failures\n`);
  console.log("  endpoint            n     p50     p95     max");
  for (const [label, ms] of [...byLabel.entries()].sort()) {
    console.log(`  ${label.padEnd(18)} ${String(ms.length).padStart(4)}  ${String(pct(ms, 50)).padStart(5)}ms ${String(pct(ms, 95)).padStart(5)}ms ${String(Math.max(...ms)).padStart(5)}ms`);
  }

  const failures = results.filter((r) => !r.ok && !["self-vote", "forged-vote", "sync-after-lock"].includes(r.label));
  for (const f of failures.slice(0, 6)) console.log(`\n  FAILED ${f.label} → HTTP ${f.status} ${JSON.stringify(f.body).slice(0, 180)}`);

  console.log("");
  if (problems.length === 0) {
    console.log("  No problems found.\n");
  } else {
    console.log(`  ${problems.length} PROBLEM${problems.length > 1 ? "S" : ""}:`);
    for (const p of problems) console.log(`   · ${p}`);
    console.log("");
  }

  await control("reset");
  process.exit(problems.length || errors ? 1 : 0);
}

void main();
