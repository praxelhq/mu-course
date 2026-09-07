import { PROBLEMS } from "@/lib/content/problems";
import { PERSON } from "@/lib/content/cast";
import { NEVER_INDEX, QUESTIONS } from "@/lib/content/documents";
import { brainReport } from "./brain";
import { totals, gateLoad } from "./economics";
import { planShape, headlineText } from "./memo";
import { readBoard, type Board } from "./types";

export type RoomPlayer = { handle: string; seat: number; locked: boolean; pitching: boolean; board: unknown };

/// What the wall shows. Every number here is something the room did, and the
/// two that matter most in the debrief are how many named a person and how many
/// taught their brain something it should never have been told.
export type RoomView = {
  joined: number;
  locked: number;
  mix: { hire: number; build: number; redesign: number };
  spend: { median: number; min: number; max: number };
  /// Problems, and how many of the room touched each.
  attention: { id: string; title: string; touched: number; left: number }[];
  gates: { named: number; unnamed: number; onOnePerson: { name: string; count: number } | null };
  brain: { tested: number; leaked: number; wrong: number; clean: number };
  rulings: { continue: number; pause: number; stop: number };
  pitches: { handle: string; headline: string; shape: { hire: number; build: number; redesign: number }; votes: number }[];
  votesCast: number;
};

function median(ns: number[]): number {
  if (ns.length === 0) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function roomView(players: RoomPlayer[], votes: Record<string, number>): RoomView {
  // Every board is client-authored JSON. Read it defensively once, here, so no
  // aggregate below has to wonder whether a field is actually present.
  const read = new Map<string, Board | null>(players.map((p) => [p.handle, readBoard(p.board)]));
  const boards = [...read.values()].filter((b): b is Board => b !== null);

  const mix = { hire: 0, build: 0, redesign: 0 };
  const spends: number[] = [];
  let named = 0;
  let unnamed = 0;
  const personCounts: Record<string, number> = {};
  const brain = { tested: 0, leaked: 0, wrong: 0, clean: 0 };
  const rulings = { continue: 0, pause: 0, stop: 0 };

  for (const b of boards) {
    const shape = planShape(b);
    mix.hire += shape.hire; mix.build += shape.build; mix.redesign += shape.redesign;
    spends.push(totals(b).spendLakh);

    const touched = PROBLEMS.filter((p) => (b.picks[p.id] ?? []).length > 0);
    for (const p of touched) {
      if (b.gates[p.id]) { named += 1; personCounts[b.gates[p.id]] = (personCounts[b.gates[p.id]] ?? 0) + 1; }
      else unnamed += 1;
    }

    if (b.asked.length > 0) {
      brain.tested += 1;
      const r = brainReport(b.indexed, b.asked);
      if (NEVER_INDEX.some((id) => b.indexed.includes(id))) brain.leaked += 1;
      else if (r.harmful > 0) brain.wrong += 1;
      else brain.clean += 1;
    }

    if (b.ruling) rulings[b.ruling] += 1;
  }

  const busiest = Object.entries(personCounts).sort((a, b) => b[1] - a[1])[0];

  return {
    joined: players.length,
    locked: players.filter((p) => p.locked).length,
    mix,
    spend: { median: median(spends), min: spends.length ? Math.min(...spends) : 0, max: spends.length ? Math.max(...spends) : 0 },
    attention: PROBLEMS.map((p) => ({
      id: p.id,
      title: p.title,
      touched: boards.filter((b) => (b.picks[p.id] ?? []).length > 0).length,
      left: boards.filter((b) => b.leaving === p.id).length,
    })),
    gates: {
      named, unnamed,
      onOnePerson: busiest ? { name: PERSON.get(busiest[0])?.name ?? busiest[0], count: busiest[1] } : null,
    },
    brain,
    rulings,
    pitches: players
      .filter((p) => p.pitching)
      .map((p) => {
        const b = read.get(p.handle) ?? null;
        return {
          handle: p.handle,
          headline: b ? headlineText(b) : "",
          shape: b ? planShape(b) : { hire: 0, build: 0, redesign: 0 },
          votes: votes[p.handle] ?? 0,
        };
      })
      .sort((a, b) => b.votes - a.votes),
    votesCast: Object.values(votes).reduce((n, v) => n + v, 0),
  };
}

export const QUESTION_COUNT = QUESTIONS.length;
