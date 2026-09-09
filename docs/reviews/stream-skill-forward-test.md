# Forward Test — `mu-map-career-streams`

**Test date:** 17 July 2026  
**Skill under test:** `.agents/skills/mu-map-career-streams/SKILL.md`  
**Raw inputs:** `docs/course/course-1-concept.md` and `docs/lessons/session-05-make-the-system-act/lesson-plan.md`  
**Comparison reference:** `docs/course/stream-coverage-matrix.md`  
**Test posture:** Fresh application. The existing coverage matrix was treated as a comparison and recovery source, not as proof that the skill would force a correct result from the two raw inputs.

## Verdict

**FAIL**

The skill points in the right direction and would catch several obvious failures: a generic AI-strategy project, a stream represented only by a chatbot, an unavailable private-data dependency, or a materially easier qualification. It does not yet force the current course doctrine or a delivery-ready, non-cosmetic mapping.

Two defects are decisive:

1. its minimum project identity still says `company × stream/function × business problem`, while the accepted course contract is `target role × representative work context × consequential decision × inspectable evidence` with distinct operator and advisor/investor modes; and
2. it treats Finance as one of nine rows but never requires separate Investment Banking, Venture Capital, and Corporate Finance anchors.

The source lesson happens to correct both defects. That is evidence of strong lesson authorship and matrix design, not evidence that this skill reliably enforces them. A fresh author could follow every explicit instruction in the skill and still produce an internally framed Consulting project, one generic Finance example, and nine lightly renamed workflows.

## Test method

I followed the skill's prescribed sequence:

1. read the current course concept, decision log, capability map, assessment system, and stream matrix;
2. isolated Session 05's common capability: convert a bounded method into a controlled execution layer using `Trigger → Validate → Enrich/decide → Human gate → Act → Log → Recover`;
3. checked every stream and Finance subpath against the skill's seven required mapping fields:
   - authentic post-MBA task and decision owner;
   - feasible company/problem example;
   - public or supplied evidence/data;
   - inspectable output;
   - recruiter-verifiable signal in under two minutes;
   - in-class simulation or held-out variant;
   - gaming, access, privacy, and fairness risks;
4. applied a **noun-swap test**: if the event labels and approver title can be swapped without changing the payload, decision rule, failure, action, and proof, the skin is cosmetic;
5. applied an **equivalence test**: each variant must demand the same common capability and evidence burden while changing the professional judgment, not the difficulty;
6. compared the result with the detailed stream matrix to identify whether missing specificity was forced by the skill or rescued elsewhere in the repository.

## Expected output of a passing forward run

For Session 05, a passing mapper should produce one common execution contract plus a content-pack contract for every stream/subpath. Each content-pack row needs:

- a named role and accountable decision owner;
- operator or advisor/investor mode;
- a company and narrow representative work context;
- a consequential decision and business metric/guardrail;
- an event schema with at least the distinctive fields that make the work authentic;
- public evidence plus a named supplied synthetic dataset where internal records are necessary;
- D/M/H/X allocation;
- a consequential action and mandatory stop;
- normal, malformed, duplicate, policy/low-confidence, and service-failure fixtures adapted to the role;
- an inspectable Session 05 output;
- a two-minute recruiter proof action;
- stream-specific gaming, data-access, privacy, fairness, and misrepresentation risks;
- a 30% judgment anchor of comparable scope.

The present skill requests most of these concepts across a course-level matrix, but it does not require this lesson-level content-pack contract or a crosswalk from course examples to session fixtures.

## Forward-run result by stream

The following table evaluates what the skill can recover from the two raw inputs before using the comparison matrix to fill gaps.

| Stream or path | Authentic unit of work in Session 05 | Role/decision owner | Company/problem and evidence pack in raw input | Non-cosmetic failure and boundary | Two-minute proof | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Consulting | Route a client operating incident through an intervention-framing method and pilot-review task | Partner/client approval is named, but ownership is split rather than one accountable decision role | No company, client process, baseline dataset, or benefit model is bound to this lesson | Invalid source or rejected benefit assumption changes the intervention and value case | Not specified for the Session 05 artifact | **Partial** |
| FOCOS | Convert a weekly operating pack into priorities, owners, and escalations | CEO/CoS priority authority is legible | No company, operating-pack schema, functions, resource constraint, or decision metric is bound to the row | Protected initiative and missing owner create a genuine cross-functional stop | Not specified | **Partial** |
| Product Management | Turn a user-session incident into a release/fallback decision and tracked issue | PM/trust owner release boundary is legible but could be one named role | No company, user/job, event taxonomy, acceptance threshold, or session telemetry fixture is bound to the row | Unsafe response or absent task telemetry changes the release decision | Not specified | **Partial** |
| Finance — IB | Reconcile a new data-room filing and route a model/deal-team exception | Senior deal team controls model/client-material change | No named company/deal or actual filing/model fixtures in the lesson | Duplicate filing and changed working-capital/covenant term are role-specific | Trace filing → normalized field → review task is inspectable, though no timed proof is stated | **Strong structure; pack missing** |
| Finance — VC | Rescore open diligence questions and route an IC review note | Investor owns advance/hold/pass | No named target/category, data-room schema, or evidence fixtures in the lesson | Unsupported retention claim and conflicting founder/third-party evidence are role-specific | Disconfirming-evidence trail is inspectable, though no timed proof is stated | **Strong structure; pack missing** |
| Finance — Corporate Finance | Route a forecast variance or capital request through scenario review | CFO/budget owner authorizes allocation | No company, planning model, source tables, or scenario fixtures in the lesson | Changed cost-of-capital/demand assumption or stale source is role-specific | Scenario/downside log is inspectable, though no timed proof is stated | **Strong structure; pack missing** |
| HR | Route a workforce or policy request through safeguards and human review/appeal | “HR decision/appeal” does not name whether the owner is HRBP, policy owner, manager, or committee | No company; “workforce/policy request” combines at least two unlike jobs; no policy, data sheet, or synthetic workforce table is bound to the row | PII, proxy bias, and high-impact ranking are authentic mandatory stops | Not specified | **Partial; task too broad** |
| Supply Chain & Operations | Prioritize a delay/stockout exception and create a planner task | Planner override is clear | No company, node/order/inventory event schema, SLA, capacity, cost, or safety pack is bound to the row | Duplicate event plus supplier timeout tests idempotency and operator recovery | Not specified | **Strong mechanism; pack missing** |
| Sales | Convert a CRM/buyer signal into an approved next action | Seller approval is clear | No company, product/claim sources, CRM schema, opt-out state, or buyer-objection fixture is bound to the row | Unsupported claim, stale CRM, and auto-send boundary are role-specific | Not specified | **Strong mechanism; pack missing** |
| Marketing | Route an approved brief or asset through claim/brand review and experiment queue | Brand/legal approval is clear, but final decision ownership could be singular | No company, audience, proposition, brand constraints, claim source, asset, or experiment metric is bound to the row | Unsupported claim or locked-brand violation changes release | Not specified | **Partial; risks cosmetic without pack** |
| Data | Route a metric/data anomaly through validity checks and a decision-owner alert | Data owner controls release | No company, metric contract, tables, lineage, tests, or downstream decision is bound to the row | Leakage, metric-definition change, and failed data test are role-specific | Not specified | **Strong mechanism; pack missing** |

### Noun-swap result

The rows are not merely nine chatbot prompts. Their failure modes and authority boundaries are meaningfully different, especially across IB, VC, Corporate Finance, HR, Operations, Sales, and Data. That is a genuine strength.

However, most rows still fail a stricter noun-swap test at the executable level because the lesson contains no bound schemas or evidence fixtures. The same generic event envelope, approval card, queue, and log could be relabelled across Consulting, FOCOS, Product, Marketing, and HR without forcing different data fields, business calculations, or decision rules. The promised “stream case packs” are listed as materials but not specified or linked.

### Equivalence result

All rows share the same common success standard: normal completion, safe stop, no duplicate consequential action, logged human approval, failure diagnosis, and replay. That supports comparability.

The 30% stream anchors are directionally authentic, but equivalence is asserted rather than demonstrated. There is no mapper output showing that each row has comparable:

- number and quality of evidence sources;
- quantitative or structured-data burden;
- decision consequence;
- ambiguity and failure difficulty;
- amount of build work;
- proof burden;
- assessor calibration anchor.

Without that comparison, a polished Marketing queue or simple FOCOS task router may be easier to finish than an IB reconciliation or Data validity pipeline, even if the rubric weights are nominally identical.

## What the existing stream matrix successfully repairs

The comparison matrix contains most of the missing course-level substance:

- three company × function × problem examples for every stream;
- public evidence sources and clearly labelled synthetic-data policy;
- authentic post-MBA work descriptions;
- simulation pressures, risk/gaming patterns, and recruiter proof questions;
- operator versus advisor/investor doctrine;
- separate IB, VC, and Corporate Finance examples;
- one common simulation engine with changing roles, outcomes, evidence packs, failures, human boundaries, and scoring;
- a common portfolio contract and cross-stream anti-gaming controls.

This makes the repository architecture much stronger than the raw Session 05 rows alone. It does not close the delivery gap: the matrix offers options, while the lesson needs one frozen golden path and actual fixtures per stream/subpath. There is no explicit identifier linking, for example, the Session 05 Consulting row to an IndiGo disruption-support pack, or the Sales row to an IndiaMART lead event schema and approved-claims source set.

## Findings

### Blocker

#### B1 — The skill's project identity conflicts with the accepted course contract

The skill makes `company × stream/function × business problem` the minimum definition and repeatedly frames its gate as approving a “company project.” D-014 and the course concept instead require `target role × representative work context × consequential decision × inspectable evidence`, with advisor/investor mode for Consulting, IB, and VC.

**Why this blocks release of the skill:** A faithful fresh run can wrongly place a Consulting student inside the favourite company's operating team or frame an IB/VC candidate as making an internal company decision. The source lesson avoids the error, but the reusable instruction can reintroduce it.

**Required change:** Replace the minimum identity and approval-gate language. Require a declared mode and explain that target employer, subject company/client, and work context are different fields in advisor/investor pathways.

### Major

#### M1 — Finance subpaths are not an enforced requirement

The skill names Finance as one stream and contains no instruction that every capability, artifact, lesson, simulation, rubric anchor, and golden sample must be checked separately for Investment Banking, Venture Capital, and Corporate Finance.

**Evidence:** Session 05 supplies three good subvariants only because the author added them. A skill-compliant output with one generic “financial analysis” row would currently pass its explicit nine-row rule.

**Required change:** Define the coverage unit as nine streams **plus three mandatory Finance subpath anchors**. Allow a shared Finance row only after all three subpaths have passed the same fields.

#### M2 — No lesson-level content-pack contract is required

The skill requests a course matrix, but does not require lesson authors to bind each variant to an event schema, source/data pack, distinctive decision rule, fixture set, output, and validator. Session 05 therefore names “stream case packs” without defining or linking them.

**Impact:** Authentic prose can collapse into cosmetic labels during LMS implementation.

**Required change:** Add a per-capability/per-lesson variant schema and require stable IDs linking the coverage matrix, lesson variant, simulator pack, quiz item, validator fixture, and assessor anchor.

#### M3 — Equivalence has no operational test

“Equivalent ambition” is stated but not measured. The skill offers no comparison of evidence burden, task complexity, consequence, ambiguity, build effort, failure difficulty, or verification time.

**Impact:** Streams can share a 70/30 rubric while facing materially unequal work.

**Required change:** Add an equivalence checklist and require a cross-stream table with bounded ranges or calibrated exemplars for those seven dimensions. Flag both under-scoped and over-scoped variants.

#### M4 — The noun-swap test is absent

The shared-mechanism guidance is useful, but the skill does not require proof that the stream skin changes the payload, metric, decision rule, failure, action, authority, and evidence—not just nouns and UI labels.

**Impact:** Consulting, FOCOS, Product, HR, and Marketing variants can look authentic in prose while running on the same generic queue.

**Required change:** Add a noun-swap rejection test. A variant should fail if at least four of seven authenticity fields remain unchanged after swapping the stream label.

#### M5 — The skill does not reconcile the 70/30 rubric with its seven mapping fields

The current assessment contract uses 70% common capability and 30% stream judgment. The skill asks for recruiter signals and equivalent ambition but does not require one observable 30% anchor, assessor evidence, or performance-level exemplar per stream/subpath.

**Impact:** The map may inform examples without becoming scorable.

**Required change:** Require every variant to name its 30% judgment criterion, observable evidence, one pass anchor, one fail anchor, and one likely cross-section scoring disagreement.

### Minor

#### m1 — Decision-owner singularity is not checked

The skill asks for a decision owner but does not say to reject combined labels. Session 05 uses “partner/client approval,” “PM/trust owner,” “brand/legal approval,” and generic “HR decision/appeal.” These may represent sequential gates, but the final accountable decision is unclear.

**Required change:** Separate accountable decision owner, required approver, consulted expert, and appeal authority.

#### m2 — “Recruiter can verify in under two minutes” lacks a test format

The requirement is strong, but no proof action, timer, artifact location, or success condition is defined. The matrix's recruiter questions are useful prompts, not a timed verification protocol.

**Required change:** Specify a two-minute proof card: open artifact, trace one claim/input, show one run/failure, and state the human boundary.

#### m3 — Risk categories are bundled rather than required separately

The skill lists gaming, access, privacy, and fairness risks in one bullet. A mapper can provide one generic risk and leave other relevant categories blank.

**Required change:** Make each category a separate nullable field with a reason; add safety, misrepresentation/non-affiliation, and regulated-advice risk.

#### m4 — No controlled vocabulary or IDs connect handoffs

The skill hands outputs to lesson, simulator, and validation skills but does not define stable stream, Finance-path, mode, case-pack, capability, or artifact IDs.

**Impact:** Cross-document drift is difficult to detect at 480-student scale.

**Required change:** Add IDs such as `S05-SALES-INDIAMART-01` and validate referential integrity.

## Strengths worth preserving

- It explicitly protects one transferable core instead of nine unrelated courses.
- It requires authentic tasks, decision owners, evidence, inspectable outputs, recruiter signals, simulations, and risks.
- It rejects company fandom, generic AI strategy, confidential-data assumptions, and dependence on employee access.
- It identifies several structural fairness hazards: chatbot/marketing dominance, private-data finance/HR work, coding advantage in Data, and subjective creative grading.
- It separates the shared mechanism from the career skin and insists on equivalent qualifications.
- Its output and handoff model encourages a durable coverage matrix instead of scattered examples.

These are the right foundations. The failure is one of enforceability and alignment with newer accepted decisions, not of intent.

## Release criteria for a retest

The skill should be retested only after it:

1. adopts the formal project spine and operator/advisor/investor modes;
2. requires IB, VC, and Corporate Finance subpath coverage;
3. adds a lesson-level variant/content-pack schema with stable IDs;
4. adds noun-swap and equivalence tests;
5. binds each variant to the 70/30 rubric and a two-minute recruiter proof;
6. makes risk categories explicit; and
7. requires the validator to flag missing links between matrix, lesson, simulator, fixture, quiz, and rubric assets.

A passing retest should start from Session 05 without consulting the current matrix, produce eleven role-authentic content-pack rows (nine streams with three Finance subpaths), and then converge with the matrix on work context, evidence, failure, authority, and recruiter signal.

## Retest after revision

**Retest date:** 17 July 2026  
**Revised skill:** `.agents/skills/mu-map-career-streams/SKILL.md`  
**Inputs held constant:** `docs/course/course-1-concept.md` and `docs/lessons/session-05-make-the-system-act/lesson-plan.md`  
**Prior conclusions assumed:** None. The revised instructions were read from the beginning and applied as a fresh mapping/release test.

### New verdict

**PASS**

The revised skill now forces the accepted course architecture, all eleven pathway rows, non-cosmetic lesson-level content packs, operational equivalence, scorable stream judgment, timed recruiter proof, and explicit risks. It also produces the correct result against the unchanged raw inputs: Session 05 has a credible common capability and eleven promising role variants, but it is **not production-complete** until the named content packs, fixtures, validators, quiz families, anchors, and proof cards exist and are linked.

That distinction resolves the central failure in the first test. The previous skill could mistake authentic-sounding prose for coverage. The revised skill must leave missing cells and release blockers instead of treating “stream case packs” as a sufficient asset.

### Release-criterion evidence

| # | Release criterion from first test | Evidence in revised skill | Retest result |
| ---: | --- | --- | --- |
| 1 | Adopt the formal spine and operator/advisor/investor modes | “Start from the accepted contract” preserves `target role × representative work context × consequential decision × inspectable evidence`; mode is mandatory; target employer is explicitly separated from subject company, client, target, portfolio company, and operating context | **Met** |
| 2 | Require IB, VC, and Corporate Finance coverage | “Coverage unit” defines eleven mandatory pathway rows and prohibits a summarized Finance row until IB, VC, and Corporate Finance pass every field independently | **Met** |
| 3 | Add a lesson-level content-pack schema and stable IDs | “Create lesson-level content-pack contracts” requires an ID and twelve bound fields covering identity, roles, context, decision, evidence, input, method, failures, output, assessment, recruiter proof, and operations | **Met** |
| 4 | Add noun-swap and equivalence tests | Dedicated sections define seven authenticity fields, a failure threshold of four unchanged fields, eight equivalence dimensions, a three-point calibration scale, and workload compensation rules | **Met** |
| 5 | Bind variants to the 70/30 rubric and two-minute proof | Dedicated sections require a 30% criterion, observable evidence, pass/fail anchors, likely scoring disagreement, moderation rule, and a four-action timed recruiter proof | **Met** |
| 6 | Make risk categories explicit | Gaming, access, privacy, safety, fairness, regulated-advice, and affiliation/misrepresentation are separate mandatory fields; `not applicable — reason` is required instead of omission | **Met** |
| 7 | Flag missing links across production assets | The required chain is `coverage matrix → lesson row → content pack → simulator state/fixture → quiz family → validator → rubric anchor → recruiter proof`; unlinked promises are explicitly declared production gaps and the coverage review flags missing content packs, fixtures, validators, and anchors | **Met** |

### Fresh Session 05 manifest produced by the revised coverage unit

Without using the existing matrix to fill content, the revised skill forces this minimum manifest from the raw lesson:

| Required row | Provisional stable pack ID | Declared mode | Distinctive decision/failure already recoverable from Session 05 | Raw-input status under revised skill |
| --- | --- | --- | --- | --- |
| Consulting | `S05-CONS-PACK-01` | advisor | sequence a client-process pilot after an incident; invalid source or rejected benefit assumption | **Skeleton only — block release** |
| FOCOS | `S05-FOCOS-PACK-01` | operator | prioritize a weekly operating pack; protected initiative or absent owner | **Skeleton only — block release** |
| Product Management | `S05-PM-PACK-01` | operator | make a release/fallback decision from user-session evidence; unsafe response or missing telemetry | **Skeleton only — block release** |
| Finance — Investment Banking | `S05-FIN-IB-PACK-01` | advisor/investor | reconcile a filing and route a deal/model exception; duplicate filing or changed working-capital/covenant term | **Skeleton only — block release** |
| Finance — Venture Capital | `S05-FIN-VC-PACK-01` | advisor/investor | rescore diligence and route an IC decision; unsupported retention claim or conflicting evidence | **Skeleton only — block release** |
| Finance — Corporate Finance | `S05-FIN-CF-PACK-01` | operator | route a forecast/capital scenario for approval; changed assumption or stale source | **Skeleton only — block release** |
| Human Resources | `S05-HR-PACK-01` | operator | route a bounded people/policy case with review/appeal; PII, proxy bias, or high-impact ranking | **Skeleton only — block release** |
| Supply Chain and Operations | `S05-OPS-PACK-01` | operator | prioritize an operating exception; duplicate event plus supplier timeout | **Skeleton only — block release** |
| Sales | `S05-SALES-PACK-01` | operator | approve a justified next action; unsupported claim, stale CRM, or auto-send | **Skeleton only — block release** |
| Marketing | `S05-MKTG-PACK-01` | operator | release/hold an asset or experiment; unsupported claim or brand violation | **Skeleton only — block release** |
| Data | `S05-DATA-PACK-01` | operator | release/hold a metric-based alert; leakage, metric-definition change, or failed data test | **Skeleton only — block release** |

This is the correct forward-test behavior. The skill neither collapses Finance into one row nor invents unavailable source packs. It identifies the eleven authentic units of work, assigns the proper mode, and blocks each row at the exact missing implementation layer.

### What the revised skill now forces the author to add

For every row above, the raw lesson still lacks some combination of:

- a frozen subject company/client/deal and non-affiliation text;
- one accountable decision owner separated from approvers, consulted roles, and appeal authority;
- metric, guardrail, permitted action, and prohibited action;
- versioned sources and supplied synthetic dataset/data dictionary;
- distinctive schema fields and business rule/calculation;
- normal, malformed, duplicate, boundary, service-failure, changed-requirement, and transfer fixtures;
- concrete validator and quiz-family IDs;
- pass/fail 30% anchors and moderator note;
- a timed recruiter proof card;
- explicit risk entries;
- accessibility/offline ownership.

The first version of the skill merely suggested several of these at course level. The revision makes all of them required content-pack fields and therefore exposes the unchanged lesson's missing assets rather than hiding them.

### Noun-swap retest

The revised skill's seven-field test would permit the common state machine and reject a relabelled generic queue. For example:

- IB must change the payload to filing/model fields, the calculation to reconciliation/scenario logic, the decision to a deal/model-material change, the failure to a material filing/term conflict, the authority to the deal team, and the proof to a source-to-normalized-field trace.
- HR must change the payload to minimized policy/workforce fields, the decision rule to prohibited-use/fairness/appeal logic, the failure to PII/proxy/high-impact action, the authority to a named accountable HR role, and the proof to the safe-stop and appeal trail.
- Sales must change the payload to CRM/buyer/claim fields, the decision to the next justified relationship action, the failure to stale evidence/unsupported claim/auto-send, the authority to the seller, and the proof to evidence → approval edit → CRM action.

Those variants may share event IDs, state transitions, logging, idempotency, and sandbox adapters. They cannot pass by changing role nouns because at least four required authenticity fields must substantively differ.

### Equivalence retest

The revised skill no longer infers equivalence from the common 120-minute schedule or identical weights. It requires explicit calibration of evidence quality, structured-data burden, ambiguity, authority consequence, build effort, failure difficulty, proof time, and reading/accessibility load. It also supplies a balancing rule: reduce mechanical burden when domain complexity is high and raise evidence/decision demand when mechanics are simple.

Applied to Session 05, this would immediately surface the likely imbalance between a mechanically simple FOCOS owner router and an IB reconciliation or Data validity pipeline. The mapper must resolve it in the content packs before marking coverage, for example by increasing the FOCOS evidence/conflict/deprioritization burden while supplying more prebuilt mechanics for IB and Data.

### Comparison with the existing stream matrix

After the raw-input inventory, consulting the matrix produces convergence rather than contradiction:

- Consulting remains an advisor/client transformation pathway.
- FOCOS, Product, Corporate Finance, HR, Operations, Sales, Marketing, and Data remain operator pathways.
- IB and VC remain deal/investment pathways rather than internal favourite-company projects.
- The matrix supplies credible company/problem options, evidence types, simulation pressures, recruiter questions, and risk patterns for all rows.
- Session 05 supplies the common execution contract plus the row-specific failure/authority starting point.
- The revised skill correctly requires a new production layer between them: frozen content-pack specs and linked assets.

No course-level matrix claim is now sufficient on its own, and no Session 05 row can be marked complete merely because a related example exists elsewhere.

### Resolution of original findings

| Original finding | Retest disposition |
| --- | --- |
| B1 — conflicting project identity | **Resolved** |
| M1 — Finance subpaths not enforced | **Resolved** |
| M2 — no content-pack contract | **Resolved** |
| M3 — no operational equivalence test | **Resolved** |
| M4 — no noun-swap test | **Resolved** |
| M5 — no 70/30 assessment binding | **Resolved** |
| m1 — combined owners not checked | **Resolved** through separate accountable owner, approver, consulted expert, and appeal fields |
| m2 — two-minute proof undefined | **Resolved** with a four-action timed proof card |
| m3 — risk categories bundled | **Resolved** with seven separate risk fields and explicit N/A reasons |
| m4 — no IDs/referential integrity | **Resolved** with stable content-pack IDs and an end-to-end asset chain |

### Non-blocking implementation note

The pairwise noun-swap instruction implies 55 comparisons across eleven rows for each mapped capability. That is defensible as an authoring check but could become noisy across ten lessons. The implementation can preserve the rule while generating comparisons automatically from structured content-pack fields and surfacing only failed or borderline pairs. This is an execution optimization, not a skill defect.

### Retest conclusion

The revised skill is release-worthy. It now does what a reusable course-production skill should do: preserve doctrine, require authentic pathway evidence, expose missing assets, prevent cosmetic skins, and create testable handoffs to lesson, simulator, quiz, validator, and assessment production.

**PASS**
