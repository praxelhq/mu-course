// U15 — the frozen final formula (docs/build/01_scoring_methodology.md §8),
// pure. NO DB imports. Null components contribute 0 but stay itemized as
// pending — the grade line always renders all seven components.

export type ComponentKey =
  | "vcm"
  | "artifact"
  | "workflow"
  | "interview"
  | "peer"
  | "quizzes"
  | "portfolio";

/** §8 weights — sum to exactly 1.0. */
export const WEIGHTS: Record<ComponentKey, number> = {
  vcm: 0.15,
  artifact: 0.15,
  workflow: 0.15,
  interview: 0.15,
  peer: 0.1,
  quizzes: 0.05,
  portfolio: 0.25,
};

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  vcm: "Value chain map",
  artifact: "Artifact quality",
  workflow: "Workflow relevance & usefulness",
  interview: "AI interview",
  peer: "Peer contribution",
  quizzes: "Surprise quizzes (best of three)",
  portfolio: "Praxy-bound portfolio",
};

export type ComponentInput = {
  raw: number | null;
  detail: string;
  /** The PCI multiplier baked into raw, where one applies (vcm, workflow). */
  pciApplied?: number | null;
  /** True until every source grade feeding this component is finalised. */
  provisional?: boolean;
};

export type GradeLineItem = {
  key: ComponentKey;
  label: string;
  raw: number | null;
  weight: number;
  /** raw × weight; 0 when pending. */
  weighted: number;
  pciApplied: number | null;
  provisional: boolean;
  pending: boolean;
  detail: string;
};

export type FinalGrade = {
  /** 0–100 — the sum of the weighted contributions. */
  total: number;
  lines: GradeLineItem[];
};

const ORDER: ComponentKey[] = [
  "vcm",
  "artifact",
  "workflow",
  "interview",
  "peer",
  "quizzes",
  "portfolio",
];

export function finalGrade(components: Record<ComponentKey, ComponentInput>): FinalGrade {
  const lines: GradeLineItem[] = ORDER.map((key) => {
    const c = components[key];
    const pending = c.raw === null;
    const weighted = pending ? 0 : c.raw! * WEIGHTS[key];
    return {
      key,
      label: COMPONENT_LABELS[key],
      raw: c.raw,
      weight: WEIGHTS[key],
      weighted,
      pciApplied: c.pciApplied ?? null,
      provisional: c.provisional ?? false,
      pending,
      detail: c.detail,
    };
  });
  return { total: lines.reduce((sum, l) => sum + l.weighted, 0), lines };
}
