import type { Approach, Risk } from "@/lib/content/problems";
import type { Ruling } from "@/lib/content/events";

/// A problem can carry more than one change. Cleaning the library and then
/// building on it is two changes against one problem — and costs the same as
/// building on the mess, while removing the risk entirely.
export type Picks = Record<string, readonly Approach[]>;

/// Everything one student has decided. Authored in the browser, mirrored to the
/// server so nothing is lost and the wall can count the room.
export type Board = {
  /// Bumped when the shape changes. A stored board from an older version is
  /// discarded rather than half-read.
  v: 2;
  handle: string;
  seat: number;
  /// Problems whose evidence they have actually opened.
  visited: string[];
  picks: Picks;
  /// problemId -> cast id of the person accountable for it.
  gates: Record<string, string>;
  /// problemId -> the id of the rationale they picked. Selection rather than
  /// prose: ninety minutes is not enough time to write, and a wrong pick names
  /// the misunderstanding more precisely than a sentence would.
  rationales: Record<string, string>;
  /// The company-brain index, by document id.
  indexed: string[];
  asked: string[];
  constraintId: string | null;
  /// The move they make in response, by choice id.
  constraintMove: string | null;
  faultId: string | null;
  /// What broke, what they add, and what happens when it is down.
  faultDiagnosis: string | null;
  faultControl: string | null;
  faultFallback: string | null;
  /// Their ordering of the response drill, by step id.
  drillOrder: string[];
  ruling: Ruling | null;
  /// The problem they are deliberately not fixing, and why. Cutesh's fifth rule.
  leaving: string | null;
  leavingReason: string | null;
  /// The seventy-five seconds, assembled from three chosen lines.
  headline: { opener: string | null; middle: string | null; closer: string | null };
  radar: string[];
  commitment: { target: string | null; evidence: string | null };
  lockedAt: string | null;
};

export type ResolvedOption = {
  problemId: string;
  approach: Approach;
  title: string;
  costLakh: number;
  liveWeek: number;
  risk: Risk;
  /// True when a redesign elsewhere made this cheaper and safer.
  discounted: boolean;
  discountNote: string | null;
  /// True when a constraint made it worse.
  penalised: boolean;
  /// True when a constraint took it off the table entirely.
  blocked: boolean;
  blockedWhy: string | null;
};

export type Totals = {
  budgetLakh: number;
  spendLakh: number;
  remainingLakh: number;
  overBy: number;
  byApproach: Record<Approach, number>;
  chosenCount: number;
  buildCount: number;
  obligations: { id: string; title: string; costLakh: number; active: boolean; text: string }[];
  earliestWeek: number | null;
  landsBefore: (week: number) => number;
};

export function emptyBoard(handle: string, seat: number): Board {
  return {
    v: 2, handle, seat,
    visited: [], picks: {}, gates: {}, rationales: {},
    indexed: [], asked: [],
    constraintId: null, constraintMove: null,
    faultId: null, faultDiagnosis: null, faultControl: null, faultFallback: null,
    drillOrder: [], ruling: null,
    leaving: null, leavingReason: null,
    headline: { opener: null, middle: null, closer: null },
    radar: [],
    commitment: { target: null, evidence: null },
    lockedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Reading a board that came from somewhere else
// ---------------------------------------------------------------------------

const APPROACHES = ["hire", "build", "redesign"] as const;
const RULINGS = ["continue", "pause", "stop"] as const;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const strRec = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
};

/// A board arrives as whatever the browser last posted: it is client-authored
/// JSON stored verbatim, so it can be half-written, from an older build, or
/// simply wrong. `v === 2` only says which build wrote it — it says nothing
/// about whether the fields the wall reads are actually there. Everything that
/// reads a stored board goes through here, because one malformed board must
/// never be able to take the console, the wall and the ballot down for a whole
/// section while sixty students are mid-session.
export function readBoard(value: unknown): Board | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.v !== 2) return null;

  const base = emptyBoard(typeof raw.handle === "string" ? raw.handle : "", typeof raw.seat === "number" ? raw.seat : -1);

  const picks: Record<string, Approach[]> = {};
  if (raw.picks && typeof raw.picks === "object" && !Array.isArray(raw.picks)) {
    for (const [k, val] of Object.entries(raw.picks)) {
      const list = strArr(val).filter((a): a is Approach => (APPROACHES as readonly string[]).includes(a));
      if (list.length) picks[k] = list;
    }
  }

  const headline = (raw.headline && typeof raw.headline === "object" && !Array.isArray(raw.headline))
    ? raw.headline as Record<string, unknown> : {};
  const commitment = (raw.commitment && typeof raw.commitment === "object" && !Array.isArray(raw.commitment))
    ? raw.commitment as Record<string, unknown> : {};

  return {
    ...base,
    visited: strArr(raw.visited),
    picks,
    gates: strRec(raw.gates),
    rationales: strRec(raw.rationales),
    indexed: strArr(raw.indexed),
    asked: strArr(raw.asked),
    constraintId: str(raw.constraintId),
    constraintMove: str(raw.constraintMove),
    faultId: str(raw.faultId),
    faultDiagnosis: str(raw.faultDiagnosis),
    faultControl: str(raw.faultControl),
    faultFallback: str(raw.faultFallback),
    drillOrder: strArr(raw.drillOrder),
    ruling: (RULINGS as readonly string[]).includes(raw.ruling as string) ? raw.ruling as Ruling : null,
    leaving: str(raw.leaving),
    leavingReason: str(raw.leavingReason),
    headline: { opener: str(headline.opener), middle: str(headline.middle), closer: str(headline.closer) },
    radar: strArr(raw.radar),
    commitment: { target: str(commitment.target), evidence: str(commitment.evidence) },
    lockedAt: str(raw.lockedAt),
  };
}
