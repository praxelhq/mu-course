export type ObjectiveStatus = "correct" | "incorrect" | "invalid" | "missing";

export type NumericResponse = number | string | { value: number | string; unit?: string };

export type NumberAnswerSpec = {
  kind: "number";
  /** Relative contribution to the deterministic dimension. Defaults to 1. */
  weight?: number;
  mode: "exact" | "tolerance" | "rounded";
  expected: number;
  tolerance?: number;
  decimals?: number;
  integer?: boolean;
  unit?: string;
  /** Multiplier from the submitted unit into the canonical expected unit. */
  acceptedUnits?: Record<string, number>;
};

export type StringAnswerSpec = {
  kind: "string";
  /** Relative contribution to the deterministic dimension. Defaults to 1. */
  weight?: number;
  expected: string;
  alternatives?: string[];
  trim?: boolean;
  caseInsensitive?: boolean;
};

export type SetAnswerSpec = {
  kind: "set";
  /** Relative contribution to the deterministic dimension. Defaults to 1. */
  weight?: number;
  expected: string[];
  allowed?: string[];
  trim?: boolean;
  caseInsensitive?: boolean;
};

export type ObjectiveAnswerSpec = NumberAnswerSpec | StringAnswerSpec | SetAnswerSpec;

export type ObjectiveReasonCode =
  | "match"
  | "mismatch"
  | "missing"
  | "not_numeric"
  | "not_finite"
  | "integer_required"
  | "unit_not_allowed"
  | "not_a_string"
  | "not_a_set"
  | "duplicate_choice"
  | "choice_not_allowed";

export type ObjectiveItemResult = {
  itemId: string;
  status: ObjectiveStatus;
  reasonCode: ObjectiveReasonCode;
  /** Learner-derived normalized response only; never the private expected value. */
  normalizedResponse?: number | string | string[];
};

export type ObjectiveSetResult = {
  items: Record<string, ObjectiveItemResult>;
  correctCount: number;
  totalCount: number;
  /** Weighted totals preserve authored question weight when one item has multiple fields. */
  correctWeight?: number;
  totalWeight?: number;
};

export type DimensionScore = { score: number; rationale: string };
