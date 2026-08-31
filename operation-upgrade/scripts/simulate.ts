/**
 * Ten students playing at once against a live instance, while a facilitator
 * drives the room. Sixty will do this on the day; this is the rehearsal that
 * finds what only breaks when people arrive together.
 *
 *   pnpm simulate <base-url> <section> <facilitator-key> [players]
 */

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

type Player = { handle: string; secret: string; seat: number; board: Record<string, unknown> };

function boardFor(handle: string, seat: number, depth: number): Record<string, unknown> {
  const picks: Record<string, string[]> = {};
  if (depth > 0) picks.docs = ["redesign"];
  if (depth > 1) picks.docs = ["redesign", "build"];
  if (depth > 2) picks.reporting = ["redesign"];
  return {
    v: 1, handle, seat,
    visited: ["docs", "calls", "reporting"].slice(0, depth + 1),
    picks,
    gates: depth > 0 ? { docs: "arun", reporting: "sunita" } : {},
    reasons: depth > 0 ? { docs: "One true version of every document before we automate a single word of it.", reporting: "One form and one deadline gives back three hours a day for one lakh." } : {},
    indexed: depth > 1 ? ["allergen26", "refunds", "catering"] : [],
    asked: depth > 1 ? ["nuts", "refund", "salary", "autorefund", "catering"] : [],
    constraintId: depth > 2 ? "thirty-days" : null,
    constraintResponse: depth > 2 ? "Everything I chose already lands by week four, so nothing needs resequencing for the board update." : "",
    faultId: null, faultAnswers: {}, ruling: null,
    leaving: depth > 2 ? "hiring" : null,
    leavingWhy: depth > 2 ? "It hurts, but no store stops trading tomorrow because a shortlist is slow." : "",
    headline: depth > 2 ? `Fix what is written down before automating anything. One true version of every document, one daily form, and stop making the reports nobody reads. Three lakh a year, all of it inside a month, and every system we build next year gets cheaper and safer. Signed, ${handle}.` : "",
    radar: [], commitment: { what: "", evidence: "" }, lockedAt: null,
  };
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
    else players.push({ handle: names[i], secret: `secret-${i}`.padEnd(16, "0"), seat: b.seat ?? -1, board: {} });
  });
  const seats = players.map((p) => p.seat);
  if (new Set(seats).size !== seats.length) {
    problems.push(`seats collided: ${JSON.stringify(seats)} — cards would be dealt identically to different students`);
  }
  console.log(`     ${players.length}/${N} in · seats ${JSON.stringify(seats)}`);

  // ── everyone plays while the facilitator drives ──────────────────────────
  console.log("  2. Everyone works while the facilitator moves the ceiling");
  const until = Date.now() + 18_000;
  const play = players.map(async (p, i) => {
    let depth = 0;
    while (Date.now() < until) {
      depth = Math.min(3, depth + (Math.random() > 0.5 ? 1 : 0));
      p.board = boardFor(p.handle, p.seat, depth);
      await Promise.all([
        call("sync", "/api/sync", {
          method: "POST",
          body: JSON.stringify({
            sectionCode: SECTION, handle: p.handle, secret: p.secret,
            board: p.board, stage: ["walk", "decide", "brain", "plan"][depth], locked: false,
          }),
        }),
        call("room", `/api/room?section=${SECTION}`),
      ]);
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 700 + i * 20));
    }
  });

  const drive = (async () => {
    for (const phase of ["walk", "decide", "brain", "plan"]) {
      await new Promise((r) => setTimeout(r, 3500));
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
        board: { ...boardFor(p.handle, p.seat, 3), lockedAt: new Date().toISOString() },
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
      board: { ...boardFor(players[0].handle, players[0].seat, 3), headline: "TAMPERED AFTER LOCK" },
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
  const view = (final.body as { view?: { joined: number; locked: number; votesCast: number; pitches: unknown[] }; spread?: Record<string, number> });
  console.log(`     joined ${view.view?.joined} · locked ${view.view?.locked} · votes ${view.view?.votesCast} · on the ballot ${view.view?.pitches?.length}`);
  console.log(`     spread ${JSON.stringify(view.spread)}`);

  if (view.view?.joined !== players.length) problems.push(`the room reports ${view.view?.joined} students but ${players.length} joined`);
  if (view.view?.locked !== players.length) problems.push(`${view.view?.locked} of ${players.length} plans locked`);
  if (view.view?.votesCast !== players.length) problems.push(`${view.view?.votesCast} of ${players.length} votes counted`);

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
