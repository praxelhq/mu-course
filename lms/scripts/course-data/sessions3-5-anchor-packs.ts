import {
  createAssessmentAnchorPack,
  type AssessmentAnchorCap,
  type AssessmentAnchorDimension,
  type AssessmentAnchorPack,
} from "../../lib/assessments/assessment-anchors";

type FourBandCriteria = {
  emerging: string;
  developing: string;
  proficient: string;
  strong: string;
};

function example(
  key: string,
  bandKey: string,
  summary: string,
): AssessmentAnchorDimension["safeExamples"][number] {
  return { key, bandKey, source: "authored-abstract", summary };
}

function fourBandDimension(args: {
  key: string;
  criteria: FourBandCriteria;
  exampleBand?: "emerging" | "developing" | "proficient" | "strong";
  exampleSummary: string;
  caps?: AssessmentAnchorCap[];
}): AssessmentAnchorDimension {
  const exampleBand = args.exampleBand ?? "proficient";
  return {
    key: args.key,
    bands: [
      { key: "emerging", min: 0, max: 2, criteria: [args.criteria.emerging] },
      { key: "developing", min: 3, max: 5, criteria: [args.criteria.developing] },
      { key: "proficient", min: 6, max: 8, criteria: [args.criteria.proficient] },
      { key: "strong", min: 9, max: 10, criteria: [args.criteria.strong] },
    ],
    caps: args.caps ?? [],
    safeExamples: [
      example(`${args.key}-${exampleBand}-abstract`, exampleBand, args.exampleSummary),
    ],
  };
}

function smallScaleDimension(args: {
  key: string;
  max: 2 | 3;
  criteria: string[];
  exampleSummary: string;
  caps?: AssessmentAnchorCap[];
}): AssessmentAnchorDimension {
  return {
    key: args.key,
    bands: args.criteria.map((criterion, score) => ({
      key: score === args.max ? "complete" : score === 0 ? "missing" : `partial-${score}`,
      min: score,
      max: score,
      criteria: [criterion],
    })),
    caps: args.caps ?? [],
    safeExamples: [
      example(
        `${args.key}-complete-abstract`,
        "complete",
        args.exampleSummary,
      ),
    ],
  };
}

function pack(dimensions: AssessmentAnchorDimension[]): AssessmentAnchorPack {
  return createAssessmentAnchorPack({ safeForProcessor: true, dimensions });
}

export const S3_DATA_ANCHORS = pack([
  fourBandDimension({
    key: "functionality",
    criteria: {
      emerging: "No executable result, the wrong dataset version, or no more than two authored objective checks pass.",
      developing: "Three or four authored objective checks pass, with a material filter, null, median or grouping error remaining.",
      proficient: "Five authored objective checks pass and the remaining gap is bounded arithmetic or rounding; units and output shape are present.",
      strong: "All authored objective checks pass under the checksum-bound contract, including units, tie rule and output shape.",
    },
    exampleBand: "strong",
    exampleSummary: "All authored objective statuses pass and the submitted outputs preserve the declared units and dataset binding.",
  }),
  fourBandDimension({
    key: "craft",
    criteria: {
      emerging: "Formula or code is absent, invented, unexecuted or represented only by prose or a screenshot.",
      developing: "Some executable working exists, but hidden assumptions, brittle ranges, silent coercion or an unclear output contract make reruns risky.",
      proficient: "Working is readable and rerunnable; grain, columns, null policy, units, rounding and the scale route are explicit.",
      strong: "Working is concise and reusable; assertions fail closed on version, schema or type drift and compact counts make the run auditable without exposing rows.",
    },
    exampleSummary: "Executable working states the grain and null policy, emits compact aggregate counts and stops on schema drift.",
    caps: [{
      key: "working-not-reproducible-cap",
      max: 2,
      whenFlags: ["working_not_reproducible"],
      rationale: "A prose-only or uninspectable method cannot exceed the emerging craft band.",
    }],
  }),
  fourBandDimension({
    key: "relevance",
    criteria: {
      emerging: "The recommendation is generic, lacks reproducible evidence, or makes a market or causal claim the slice cannot support.",
      developing: "Some evidence is cited, but the decision link, denominator or limitation is missing and observation blurs into inference.",
      proficient: "Valid aggregates support a concrete next action and a meaningful limitation is named.",
      strong: "Decision framing is precise; evidence is triangulated and observation, inference and limitation are explicit without representativeness or causal overclaim.",
    },
    exampleSummary: "A concrete next action cites checked aggregates and explicitly limits the claim to the observed slice.",
    caps: [
      {
        key: "population-overclaim-cap",
        max: 5,
        whenFlags: ["population_overclaim"],
        rationale: "A population claim unsupported by the teaching slice cannot exceed the developing relevance band.",
      },
    ],
  }),
  fourBandDimension({
    key: "verification-evidence",
    criteria: {
      emerging: "No independent second method or inspectable working exists, or the claimed check uses the wrong dataset binding.",
      developing: "A second attempt exists but shares the first method's mechanics or assumptions, or disagreement is left undiagnosed.",
      proficient: "Two meaningfully independent methods use the same contract; their results and any gap are reported and repaired or honestly flagged.",
      strong: "The trace also reconciles included and excluded counts, includes a bounds check and explains which different errors the methods can catch.",
    },
    exampleSummary: "Two different computational routes agree under one query contract and the trace explains their independent failure modes.",
    caps: [{
      key: "same-method-cap",
      max: 2,
      whenFlags: ["same_method_twice"],
      rationale: "Repeating the same mechanics does not establish an independent verification method.",
    }],
  }),
]);

export const S3_VISUAL_ANCHORS = pack([
  {
    key: "functionality",
    bands: [
      { key: "emerging", min: 0, max: 1, criteria: ["No more than one of the six authored stable-option selections passes."] },
      { key: "developing", min: 2, max: 3, criteria: ["Two or three authored stable-option selections pass."] },
      { key: "proficient", min: 4, max: 5, criteria: ["Four or five authored stable-option selections pass."] },
      { key: "strong", min: 6, max: 6, criteria: ["All six authored stable-option selections pass."] },
    ],
    caps: [],
    safeExamples: [example("visual-selection-strong-abstract", "strong", "Every stable selection matches its declared analytical job and data shape.")],
  },
  {
    key: "rationale-quality",
    bands: [
      { key: "emerging", min: 0, max: 3, criteria: ["Rationales are aesthetic, mismatched, unsupported or make incorrect data-shape claims."] },
      { key: "developing", min: 4, max: 7, criteria: ["Some visual reasons are plausible, but decision, data-shape or guardrail links are repeatedly missing."] },
      { key: "proficient", min: 8, max: 10, criteria: ["Most rationales connect the analytical job to the encoding and include relevant limitations."] },
      { key: "strong", min: 11, max: 12, criteria: ["Every rationale links job, data shape and encoding while naming the scenario's important guardrail."] },
    ],
    caps: [],
    safeExamples: [example("visual-rationale-strong-abstract", "strong", "The rationale names the comparison or distribution task, explains the encoding and states a missingness or inference guardrail.")],
  },
]);

export const S4_PRODUCT_PROMPT_ANCHORS = pack([
  smallScaleDimension({
    key: "user-value",
    max: 2,
    criteria: [
      "Only a product category is named; no specific user or job is evidenced.",
      "A user or job is present, but the observable result remains thin.",
      "A specific user, job and observable result are all explicit.",
    ],
    exampleSummary: "The prompt names one user, a concrete job and the result that person should observe.",
  }),
  smallScaleDimension({
    key: "scope-state-interactions",
    max: 3,
    criteria: [
      "The response is a list of screens or adjectives with no state or interaction model.",
      "A vertical slice is implied, but state and interactions are mostly unspecified.",
      "Scope, core state and several interactions are bounded, with one material ambiguity.",
      "The vertical slice, state model and create, edit, order and failure interactions are explicit.",
    ],
    exampleSummary: "A bounded vertical slice names stored state and observable create, edit, reorder and failure behavior.",
  }),
  smallScaleDimension({
    key: "truth-boundaries",
    max: 2,
    criteria: [
      "External success is implied and core, simulated and out-of-scope behavior are not separated.",
      "Some mock boundaries are present, but labels or exclusions remain ambiguous.",
      "Core, simulated and out-of-scope behavior are separated with exact user-facing labels.",
    ],
    exampleSummary: "The contract labels simulated analytics and integrations and names excluded backend behavior.",
  }),
  smallScaleDimension({
    key: "failure-access",
    max: 2,
    criteria: [
      "Only a mouse-driven happy path is described.",
      "A failure or access behavior is named, but important states remain absent.",
      "Invalid, empty and destructive states plus keyboard, label and focus behavior are explicit.",
    ],
    exampleSummary: "The plan names invalid and empty states and requires keyboard operation, labels and visible focus.",
  }),
  smallScaleDimension({
    key: "acceptance-verification",
    max: 3,
    criteria: [
      "Completion is described only as polished or visually similar.",
      "A few checks exist, but they are not observable or tied to evidence.",
      "Most acceptance checks are observable and a stop condition is present, with one evidence gap.",
      "Observable acceptance tests, evidence capture and the stop condition are complete.",
    ],
    exampleSummary: "Acceptance tests name visible inputs and outputs, required evidence and the exact stop condition.",
  }),
]);

export const S4_APP_ANCHORS = pack([
  fourBandDimension({
    key: "functionality",
    criteria: {
      emerging: "No inspectable app exists, the URL is inaccessible, or the core creator-to-public journey fails.",
      developing: "The public app loads and some core behavior works, but fewer than twelve core acceptance checks pass or a stop-the-line failure remains.",
      proficient: "Twelve to fourteen core checks pass; public journey and state operations work and limitations are visible.",
      strong: "All core checks and the authored publish/access threshold pass with no hidden external dependency; an eligible revision preserves prior passes.",
    },
    exampleBand: "strong",
    exampleSummary: "The public app completes the creator-to-public journey and all frozen acceptance checks under a clean session.",
    caps: [{
      key: "dead-link-cap",
      max: 3,
      whenFlags: ["link-dead"],
      rationale: "A dead or blocked public URL cannot establish more than emerging functionality.",
    }],
  }),
  fourBandDimension({
    key: "craft",
    criteria: {
      emerging: "The prompt or implementation is copied, incoherent or default-looking, with errors and access ignored.",
      developing: "The prompt and interface are adequate, but state, copy, error handling, responsive hierarchy or access is uneven.",
      proficient: "Prompt and plan decisions visibly shape an original responsive product with deliberate empty, error and keyboard behavior.",
      strong: "Information hierarchy, interaction feedback and state are coherent and economical; trade-offs are defensible without decorative excess.",
    },
    exampleSummary: "A focused state model drives a responsive interface with deliberate feedback, empty states and keyboard behavior.",
  }),
  fourBandDimension({
    key: "relevance",
    criteria: {
      emerging: "No defensible user job exists, branding is copied, or feature choices are unrelated to the stated user.",
      developing: "The user and benchmark are plausible, but priorities are thin or the generic classroom fixture remains materially unchanged.",
      proficient: "Current public sources, a specific user and original choices create a focused slice connected to the team's industry or anchor context.",
      strong: "Public context, user value, feasibility and the one-hour contract are deliberately transferred; omissions and priorities are defended without private data.",
    },
    exampleSummary: "An original product slice uses public evidence to support one industry-specific user job and defends its omissions.",
  }),
  fourBandDimension({
    key: "verification-evidence",
    criteria: {
      emerging: "Evidence is only a claim or screenshot, lacks negative checks, or cannot be matched to acceptance IDs.",
      developing: "A partial pass/fail log exists, but environment, peer, negative, access or limitation detail is missing.",
      proficient: "A reproducible acceptance log, clean-session peer check, negative tests, environment and honest limitations map evidence to claims.",
      strong: "Evidence covers core, failure, mobile, keyboard and publication behavior; revisions are regression-tested and remaining uncertainty is bounded.",
    },
    exampleSummary: "A timestamped clean-session log maps positive, negative, mobile and keyboard evidence to frozen acceptance IDs.",
  }),
]);

const FLOWCHART_DIMENSIONS: Array<{
  key: string;
  missing: string;
  partial: string;
  complete: string;
  example: string;
  caps?: AssessmentAnchorCap[];
}> = [
  { key: "F01", missing: "No measurable result or owner is named.", partial: "A result or owner exists, but not both.", complete: "A measurable result, named owner and non-goal are explicit.", example: "A named owner has one measurable result and one declared non-goal." },
  { key: "F02", missing: "The trigger and stable event identity are absent.", partial: "A trigger exists, but identity is late or unstable.", complete: "Source event, stable identity and trace rule are explicit.", example: "The trigger supplies a stable event ID that appears in every trace." },
  { key: "F03", missing: "Required fields, types and invalid-input handling are absent.", partial: "Core fields are named but edge rules remain thin.", complete: "Types, required rules, invalid route and sensitivity are explicit.", example: "Typed required fields route malformed input to a named quarantine state." },
  { key: "F04", missing: "Paths disappear and business states or terminal outcomes are absent.", partial: "Some states exist, but waiting or terminal outcomes are unclear.", complete: "Named business states make every branch land in a terminal outcome.", example: "Every branch ends in success, duplicate, rejected, quarantined or exhausted." },
  { key: "F05", missing: "An irreversible action can occur before a dedupe check.", partial: "A key or check exists, but storage or concurrency remains unclear.", complete: "The idempotency key precedes action and recorded state includes a concurrency control or limitation.", example: "An atomic uniqueness check records the event before any external action." },
  { key: "F06", missing: "Errors are ignored or every failure retries without bound.", partial: "Transient and deterministic errors are only partly separated.", complete: "Transient retry is bounded and exhaustion or deterministic failure reaches a manual queue.", example: "Only transient failures retry twice before a named exhausted state." },
  { key: "F07", missing: "Iteration or recursion is unbounded.", partial: "A cap exists, but exit or overflow behavior is absent.", complete: "Cap, exit, overflow route and cost or ordering implication are explicit.", example: "A finite batch cap routes overflow to a resumable queue." },
  { key: "F08", missing: "A risky action can occur without a recorded approval state.", partial: "An alert is called approval or reject and expiry paths are absent.", complete: "Pending, approve, reject and expiry states precede the risky action.", example: "A recorded pending state gates the action until approve, reject or expiry.", caps: [{ key: "unsafe-action-cap", max: 0, whenFlags: ["unsafe-external-action"], rationale: "An unsafe external action without the required gate cannot receive partial control credit." }] },
  { key: "F09", missing: "Trace, audit ownership and health signals are absent.", partial: "Logs exist without an owner or threshold.", complete: "Trace, state, owner, error queue and metric threshold are explicit.", example: "The design names a trace ID, error owner and queue-depth threshold." },
  { key: "F10", missing: "Credentials, personal data or a public secret appears, or privacy controls are absent.", partial: "Minimum data and retention are mentioned but not justified.", complete: "Data minimisation, consent or retention, least privilege and secret scrubbing are explicit.", example: "Only synthetic fields are retained and credentials remain in managed connections.", caps: [{ key: "sensitive-data-cap", max: 0, whenFlags: ["sensitive-data"], rationale: "Sensitive data exposure cannot receive partial privacy-control credit." }] },
  { key: "F11", missing: "Only a run-once claim exists.", partial: "The happy path and one failure are predicted.", complete: "Normal, duplicate, malformed, timeout and approval cases have predicted outcomes.", example: "Five named cases each have an expected terminal state and trace." },
  { key: "F12", missing: "The tool chain is opaque and no copy or recovery route exists.", partial: "Modules are named without rationale or handoff detail.", complete: "Make fit, dependencies, reconnection handoff and outage route are explicit.", example: "The design explains Make's role and how a clone reconnects dependencies after outage." },
];

export const S5_FLOWCHART_ANCHORS = pack(
  FLOWCHART_DIMENSIONS.map((dimension) =>
    smallScaleDimension({
      key: dimension.key,
      max: 2,
      criteria: [dimension.missing, dimension.partial, dimension.complete],
      exampleSummary: dimension.example,
      caps: dimension.caps,
    }),
  ),
);

export const S5_WORKFLOW_ANCHORS = pack([
  fourBandDimension({
    key: "functionality",
    criteria: {
      emerging: "No reproducible run exists or the core path performs an unsafe action.",
      developing: "Only the normal path works or material fixture failures remain.",
      proficient: "The normal path and most failure cases work and the core result is bounded.",
      strong: "All five deterministic cases pass with safe, bounded behavior and no hidden manual patch.",
    },
    exampleBand: "strong",
    exampleSummary: "Normal, duplicate, malformed, timeout and approval cases reach their expected safe states.",
    caps: [
      { key: "unsafe-action-cap", max: 2, whenFlags: ["unsafe-external-action"], rationale: "Unsafe core behavior cannot exceed emerging functionality." },
    ],
  }),
  fourBandDimension({
    key: "craft",
    criteria: {
      emerging: "Names and mappings are opaque, the chart is tangled, or sensitive data is exposed.",
      developing: "The workflow is followable with effort but mappings and recovery are fragile.",
      proficient: "Modules, states, contracts and outputs are readable and dependencies are explicit.",
      strong: "The workflow is minimal, legible and portable, with dependencies and limitations made explicit.",
    },
    exampleSummary: "Modules and mappings expose named contracts while portability and dependencies remain concise.",
    caps: [{ key: "sensitive-data-cap", max: 2, whenFlags: ["sensitive-data"], rationale: "Sensitive data exposure cannot exceed emerging craft." }],
  }),
  fourBandDimension({
    key: "relevance",
    criteria: {
      emerging: "The workflow is a generic demo without a real operating result.",
      developing: "A product problem is named but its owner, frequency or consequence is weak.",
      proficient: "A specific owner, frequency, process and credible time, error or revenue effect are connected.",
      strong: "The value case has checkable assumptions, an adoption constraint and limitation without fake precision.",
    },
    exampleSummary: "A named owner can check the baseline, operating effect, adoption constraint and stated limitation.",
  }),
  fourBandDimension({
    key: "verification-evidence",
    criteria: {
      emerging: "Only a screenshot or claim exists and expected versus actual traces are absent.",
      developing: "One run or a partial log exists without a complete expected versus actual contract.",
      proficient: "Multiple traces include expected and actual results plus a repair note and honest limitation.",
      strong: "All five fixtures, import or copy evidence, invariant checks and action-count proof are present and scrubbed.",
    },
    exampleSummary: "A scrubbed evidence bundle maps five expected outcomes to exact traces and proves import portability.",
  }),
]);
