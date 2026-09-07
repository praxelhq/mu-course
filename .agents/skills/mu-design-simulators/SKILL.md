---
name: mu-design-simulators
description: Design authentic classroom or Forge LMS simulations when a lesson genuinely needs stateful decisions, timed pressure, branching, staged reveals, replay, or failure injection. Use for experiences such as the Heist or a replayable decision lab; do not force ordinary data labs, app builds, or workflow studios into a simulator.
---

# MU Simulator Designer

Design simulations that test judgment under business constraints, not tool-clicking speed or trivia.

## Scope gate

Read `lms/docs/build/SOURCE_OF_TRUTH.md`, the active session brief/lesson, current LMS behavior and scoring contract. Use a simulator only when at least one is essential:

- learner choices change later state;
- information is revealed based on an action or time;
- a failure/exception must be diagnosed and replayed;
- different safe/unsafe branches need observable consequences;
- facilitator-controlled pressure materially improves the assessment.

Otherwise keep the activity as a guided lab/build with ordinary gates, assignments and feedback.

## Define the contract

Specify:

- target outcome and prerequisite;
- role, business context, objective and stakes;
- initial information and staged reveals;
- actions/decisions and their consequences;
- deterministic state/rules versus bounded model behavior;
- success, partial, unsafe and system-failure states;
- exact evidence logged for feedback/assessment;
- duration, reset, replay and facilitator controls;
- accessibility route and offline/classroom fallback;
- telemetry and test fixtures.

Use realistic constraints: incomplete data, source conflict, budget/credit, model uncertainty, malformed inputs, duplicates, timeouts, approval boundaries and privacy. Do not create difficulty through hidden UI behavior.

AI feedback must be rubric-bound, evidence-citing, confidence-bearing and contestable. Deterministic rules own factual state transitions. Keep high-impact external actions behind explicit human approval.

Career-stream variants are optional. Create them only when role, data, decision rule or consequence genuinely changes; otherwise use the common industry/company context.

## Output

Produce the simulator brief, state/branch model, input/reveal pack, learner and facilitator instructions, scoring/feedback rules, events, accessibility/offline version, test cases and LMS delta. Mark lifecycle state accurately and send the result to `$mu-validate-learning-assets`.
