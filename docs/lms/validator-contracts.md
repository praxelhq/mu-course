# Course 1 Validator Contracts

**Version:** 0.1  
**Rule:** Validators verify observable facts. They do not manufacture strategic-quality scores.

## Standard response

Every validator returns:

```json
{
  "validator_id": "string",
  "contract_version": "semver",
  "attempt_id": "string",
  "status": "pass | partial | fail | unsafe | unavailable",
  "checks": [
    {
      "check_id": "string",
      "status": "pass | fail | warning | not_applicable",
      "evidence_ref": "immutable artifact, test, event, or log reference",
      "student_message": "plain-language repair guidance",
      "reviewer_message": "technical or moderation detail"
    }
  ],
  "platform_incident": false,
  "human_review_reason": null
}
```

`unavailable` never becomes a learner failure. All results retain validator/tool/model/case versions.

## V00 — Work Sample Brief gate

**Inputs:** stream, target role, operator/advisor/investor mode, employer/sector context, decision owner, decision, work product, evidence tier, prototype form, outcome, guardrail, authority boundary, safety declarations.

**Deterministic checks:**

- all fields present and internally compatible;
- Finance subpath selected;
- chosen prototype uses a supported pattern;
- no requirement for confidential/internal access;
- decision can be shown in a sub-three-minute core run;
- task-attempt role card can be assigned;
- independent-project disclosure accepted.

**AI/human review:** AI may cite likely gaps; a trained human approves role authenticity, scope, consequentiality and equivalence. Low confidence or unsupported custom work routes to moderation.

**Unlock:** evidence mission or a curated fallback pack.

## V01 — Evidence brief validator

**Inputs:** source ledger, raw snapshot, extraction note, dataset, data dictionary, calculation workbook/notebook, claim ledger, counter-hypothesis, role-authentic brief.

**Deterministic checks:**

- source URLs/identifiers open or have archived course snapshots;
- access timestamp, source type, and usage/license note present;
- every material factual claim links to a source or calculation;
- every calculation names inputs and reproduces on a fixture;
- dataset fields match the dictionary;
- fact, calculation, observation, inference, and assumption labels exist;
- at least one counter-hypothesis and limitation;
- length/format cap and accessibility requirements.

**AI/human review:** support strength, causal humility, decision usefulness, and 30% stream judgment. The reviewer receives an evaluator-selected claim to audit.

**Hidden tests:** invalid/stale source, changed period, contradictory primary source, seeded outlier/formula.

## V02 — Grounding lab / grounded component validator

**Inputs:** corpus manifest, source dates/priority, system policy, answerability labels, held-out questions, responses, citations, retrieval traces, consent/disclosure status.

**Deterministic checks:**

- required citations refer to retrieved corpus items;
- answerable cases meet key-fact expectations;
- unanswerable cases abstain/escalate;
- newer authoritative source wins configured contradiction;
- prompt-injection string cannot override system boundary;
- disclosure is visible before interaction;
- voice/identity pack is fictional, public-domain/approved, or has recorded consent.

**Human review:** contested sources, identity risk, harmful advice, and trust design.

**Hard stop:** unauthorized identity imitation, missing consent, or deceptive affiliation.

## V03 — Prototype method-layer validator

**Inputs:** skill/method package, trigger/non-trigger definitions, input/output schema, instructions, checks, known and hidden tests, provenance.

**Deterministic checks:**

- valid package and metadata;
- positive trigger activates and negative trigger does not;
- required-input absence produces clarification/safe stop;
- output satisfies schema and required evidence fields;
- messy input does not silently drop records;
- prohibited action is not taken;
- clean-session run uses no original chat history.

**Human review:** whether the method encodes real judgment rather than a generic long prompt.

## V04 — Prototype execution/workflow validator

**Inputs:** state/action map, export/config, event fixtures, execution logs, approval records, retry/fallback, owner runbook, secret references.

**Deterministic checks:**

- valid event accepted once;
- duplicate event is idempotent;
- malformed event is rejected with traceable reason;
- model output conforms or routes to correction/escalation;
- consequential action waits for approval;
- timeout reaches retry/fallback without losing state;
- logs contain correlation ID, state, result, timestamp, and redacted error;
- secrets are referenced securely and absent from submitted files/logs.

**Human review:** automation boundary, exception ownership, value metric, and stream judgment.

## V05 — Role-authentic prototype validator

The LMS applies a common envelope plus a form adapter.

**Common inputs:** Work Sample Brief, acceptance tests, deployment/replay package, event/log schema, accessibility statement, risk boundary, task-attempt evidence, release note.

**Common checks:**

- fresh evaluator can open or replay the core task;
- structured input and output match the contract;
- normal, invalid, and high-risk inputs have visible outcomes;
- human approval/escalation works;
- at least one evidence event/log proves the run;
- injected failure is diagnosed and repaired/contained;
- no paid/custom stack is required for evaluator replay;
- accessibility and privacy essentials pass.

**Form adapters:**

- app: route liveness, core interaction, error/empty state, event receipt;
- workflow/agent: trigger, state transitions, approval, retry, replay;
- grounded assistant: V02 plus interaction log and escalation;
- dashboard/model: data refresh/reproduction, calculation tests, scenario controls, limitation display;
- data pipeline/notebook: clean environment run, lineage, tests, leakage/missingness checks, decision output.

Technical complexity earns no bonus by itself.

## V06 — Task-attempt validator

The [Task-Attempt Exchange Contract](task-attempt-exchange-contract.md) is normative for entities, states, cardinality, matching, consent, privacy, evidence classes and incident relief.

**Inputs:** exchange/assignment IDs; unique tester pseudonyms; role/input/case and equivalence-group versions; consent and evidence class; frozen acceptance-contract and prototype-v1 hashes; attempt start/end/task/safety states; evidence refs and qualification results; builder prediction; issue trail; selected change; deliberate non-change; prototype-v2 hash/diff; source-linked equivalent rerun; provenance; incident relation; small-sample disclaimer.

**Deterministic checks:**

- three to five qualified attempts from unique non-author testers, or documented incident-equivalent evidence;
- minimum set covers `expected`, `edge`, and `boundary` condition classes;
- each attempt binds immutable v1, acceptance contract, role/input/case versions and qualification result;
- evidence reveal follows prediction commit; author cannot discard qualified adverse evidence;
- task state is success, partial, safe failure, or unsafe failure and privacy classification/redaction passes;
- every issue links to attempt/evidence; release decision includes one selected change and one deliberate non-change;
- v2 links to v1; rerun links source issue/attempt, equivalent-input group, v2 and outcome/regression state;
- provenance, fallback evidence class, consent/incident relations and no-market-validation disclaimer are present;
- duplicates, wrong versions, early reveal, missing condition mix, cherry-picking and invalid rerun fail.

**Model-assisted boundary:** may flag missing evidence or suggest a likely failure layer with cited spans and confidence. It cannot qualify disputes, judge consequence/priority, or score strategic/stream quality.

**Human scoring/moderation:** trained human scores the bounded final prototype packet for every learner. Disputed authenticity, safety, business consequence, stream judgment, incident equivalence and appeals route to moderation; the gradebook map controls double scoring.

Friend clicks, page views, compliments, and unaudited external claims do not count.

## V06P — Tester-participation validator

**Inputs:** assigned/replacement/incident-equivalent assignment records, consent/decline, start/end events, role/input versions, observable task/safety state, evidence pointer, specific friction/boundary note, coaching/contact disclosure, privacy/safety report and incident relation.

**Deterministic checks:** required assignment cardinality; tester/author separation; consent or valid safe decline; uncoached attempt; observable evidence; non-empty/evidence-specific comment; duplicate/copied/noise detection; no author grade; incident-equivalent route and replacement relation.

**Human boundary:** abuse, sabotage, authenticity dispute, privacy/safety report and any conduct deduction require a named human evidence note. A failed author endpoint cannot penalize both author and tester.

## V07 — Role communication validator

**Inputs:** stakeholder/action brief, claims/source links, chosen format, accessibility version, source/asset/model ledger where relevant, disclosure, response/audit.

**Deterministic checks:** format/duration/size; captions/transcript; claim links; company/non-affiliation label; synthetic-media disclosure; rights/consent fields; locked constraints.

**Human review:** stakeholder fit, coherence, decision usefulness, and stream overlay. Visual polish cannot compensate for a false claim or wrong work product.

## V08 — Repository/proof-pack validator

**Required structure:**

```text
README.md
work-sample-brief/
evidence/
data/
prototype/
tests/
runs/
decisions/
portfolio/
PROVENANCE.md
LIMITATIONS.md
```

**Checks:**

- setup/replay instructions complete on a clean evaluator fixture;
- submitted artifacts link to immutable versions;
- source, data, tool/model, template, and asset provenance present;
- checkpoint history spans supervised milestones;
- no secrets, credentials, PII, prohibited binaries, or unlicensed sensitive assets;
- test command/checklist runs;
- limitations and supplied/generated/adapted/authored labels present.

Commit count, typing time, and prompt volume are not scored.

## V09 — Recruiter publication validator

**Inputs:** public case page, private proof links, disclosure, consent/license manifest, contact settings.

**Checks:**

- page explains role, context, decision, evidence, prototype, result, failure/fix, limits, and next test in a 60–90 second scan;
- every public link is live and access-appropriate;
- private proof is not accidentally public;
- independent educational project label is prominent;
- claims do not imply endorsement or internal access;
- synthetic/public data labels and media disclosure are visible;
- secret/PII/identity/license/brand-risk scan passes;
- keyboard, contrast, alt text, captions/transcript essentials pass.

Unsafe fails publication and opens a repair checklist.

## V10 — Individual transfer validator

**Inputs:** unseen case variant, timed structured response, clean-session artifact/change, confidence, evaluator-selected explanation.

**Checks:**

- variant differs from portfolio context but matches construct/difficulty;
- no group/shared state or original conversation is available;
- student frames decision and missing evidence before assistance;
- student changes a substantive mechanism, not labels/format;
- hidden condition is diagnosed or safely contained;
- output is tested/reproduced;
- explanation cites the observed evidence and states a limitation.

Strategic quality uses the 70/30 rubric and a trained-human primary score for every transfer packet; the validator supplies facts and flags, while moderation and double scoring protect reliability.

## Cross-validator human-review routing

Route when:

- safety/privacy/identity/brand/regulated-action flag occurs;
- deterministic and model-assisted signals conflict;
- model confidence is below the calibrated threshold;
- artifact similarity is suspicious;
- student contests feedback;
- score lies near a grade boundary;
- section-level drift or platform incident is detected;
- submission falls into the stratified audit sample.

## Required test fixtures

Each validator ships with:

- pass, partial, fail, unsafe, and unavailable cases;
- novice and advanced but equivalent implementations;
- at least two stream variants;
- accessibility fixture;
- platform-incident fixture;
- adversarial/malformed input;
- expected response JSON and student feedback copy;
- version history and named owner.
