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
