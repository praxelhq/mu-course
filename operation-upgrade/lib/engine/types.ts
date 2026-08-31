import type { Approach, Risk } from "@/lib/content/problems";
import type { Ruling } from "@/lib/content/events";

/// A problem can carry more than one change. Cleaning the library and then
/// building on it is two changes against one problem — and costs the same as
/// building on the mess, while removing the risk entirely.
export type Picks = Record<string, readonly Approach[]>;

/// Everything one student has decided. Authored in the browser, mirrored to the
/// server so nothing is lost and the wall can count the room.
export type Board = {
  v: 1;
  handle: string;
  seat: number;
  /// Problems whose evidence they have actually opened.
  visited: string[];
  picks: Picks;
  /// problemId -> cast id of the person accountable for it.
  gates: Record<string, string>;
  /// problemId -> one line saying why, in their words.
  reasons: Record<string, string>;
  /// The company-brain index, by document id.
  indexed: string[];
  asked: string[];
  constraintId: string | null;
  constraintResponse: string;
  faultId: string | null;
  faultAnswers: Record<string, string>;
  ruling: Ruling | null;
  /// The problem they are deliberately not fixing, and why. Meera's fifth rule.
  leaving: string | null;
  leavingWhy: string;
  /// The seventy-five seconds they get in front of the board.
  headline: string;
  radar: string[];
  commitment: { what: string; evidence: string };
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
    v: 1, handle, seat,
    visited: [], picks: {}, gates: {}, reasons: {},
    indexed: [], asked: [],
    constraintId: null, constraintResponse: "",
    faultId: null, faultAnswers: {}, ruling: null,
    leaving: null, leavingWhy: "",
    headline: "", radar: [],
    commitment: { what: "", evidence: "" },
    lockedAt: null,
  };
}
