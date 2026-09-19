# Shipyard studio review

## Verdict

Release candidate. Local implementation checks pass; the instructor key is configured and real Haiku rubric fixtures pass. No production deployment is claimed.

## Coverage

Reviewed against `e8cd5f305b5111c034ef913844123c62338e56b8` and the approved venture-workspace plan. The project instructs agent work to run sequentially in the main task. Correctness, authorization, data migration, external API, reliability, frontend race and test concerns were examined sequentially; this was not an independent multi-agent or cross-model review.

Code review: skipped (ce-code-review unavailable) — the skill's required separate reviewer/finisher contexts cannot run under the project's single-context instruction. A manual diff scan and the concrete validations below provide the available coverage; they are not represented as independent review.

The simplification pass reused the existing safe Markdown renderer, S3 immutable-version helpers, guarded landing renderer, Anthropic JSON validator and identity redactor. The studio UI is separated into workspace, checkpoints, shared controls and instructor overview. Polling slows when no work is active and stops on hidden tabs.

## Actionable findings

No unresolved defect was established in the reviewed local paths. Release verification remains incomplete as described below.

| Finding | Resolution and evidence |
| --- | --- |
| Browser upload sent duplicate differently-cased Content-Type headers | Replaced the header object with `Headers.set`; actual S3 upload/confirmation now succeeds. |
| Large screenshots could exceed Claude image limits | Decode and resize through Sharp; transport test verifies dimensions and JPEG conversion. |
| A stale GET could replace newer client state | Request sequence checks and mutation invalidation; dirty drafts remain protected. |
| Repeated appeal clicks returned an error instead of the existing receipt | Return the stored appeal ID; integration test checks replay. |
| Concurrent teams could exceed the daily allocation through pending work | Global admission lock plus reservations for queued/running/uncertain failures; database integration tests rerun after the change. |
| A cancelled in-flight call could prematurely release its budget reservation | Retain the reservation until actual cost is recorded. |
| Haiku demanded a payment-provider choice at checkpoint one | Explicitly exclude this implementation detail from the gate; all five decision fixtures pass on rerun. |
| New tables were absent from the demo reset inventory | Added all ten studio tables; exhaustive seed inventory test passes. |
| Instructor evidence view exposed stored design IDs instead of usable artifacts | Submitted snapshots show named immutable file links and frozen contributors. |

## Requirements and remaining gates

- Identity/team isolation, iterative briefs, explicit coach edits, evidence retrieval, three checkpoint contracts, immutable history, sequential gates and appeal authority are implemented.
- Build assistance includes MLP prompts, implementation notes, export and screenshot context. It does not execute the student's code; output still needs testing in the student's environment.
- Marketplace import, AppRill research and bounded Reddit research were exercised. X and Instagram live calls were not exercised.
- Instructor source controls, failure list, freshness and costs are implemented. Dedicated live MU signup and deployed instructor checks remain in the release sequence.
- Haiku transport/image tests are mocked; separate paid calls exercised actual narrow/oversized/service/injection/inaccessible fixtures and vision feedback. No fallback model or fake pass is enabled.
- Resend accepted a self-test to the instructor. Full student appeal delivery is checked structurally in integration tests; inbox delivery is not verified.
- Full-suite comparison: exactly the same 24 failing cases appear on the production base and this branch. The absent transformation module also predates this change. These results are recorded, not described as a clean full-suite pass.

Deployment, source import into production and post-deploy checks remain unperformed. See `lms/docs/shipyard/STUDIO_RELEASE.md` for commands, configuration and rollback.
