# S05 Case, Data, and Source Pack v1.0

All files in `data/` are **course-authored synthetic records**, 18 July 2026. Fictional entities/actions; no production API, employee, customer, issuer, shipment, or transaction data. Cite `Praxel/MU S05 synthetic fixture v1.1`.

**Staleness review due:** 17 October 2026. Recheck the state schema, sandbox connectors, policy boundaries, cached logs and tool-neutral instructions.

## S05-CASE-01 — Green checks, duplicated consequence

A fictional exception workflow treated a duplicate delivery as a new job. Both invocations returned success, but two actions were created. A later policy change routed safety events to the wrong approver. The managerial question: what combination of state, allocation, approval information, idempotency, and logs turns automation into controlled execution?

## Files

- `data/s05-event-schema.json`: common envelope and state contract.
- `data/s05-stream-events-synthetic.json`: normal + boundary + hidden event per eleven pathways; every event includes the required timestamp and source fields.
- `content-packs.md`: role-specific method, metric, action, failure and authority.

Fixtures test decisions; they do not claim production integration, legal compliance, investment accuracy, or employer practice. Learners may use approved S04 evidence but must run external actions only in mock/sandbox mode.

## Instructor fact notes, snapshot and replacement

No public company incident is asserted; the duplicate consequence and policy change are constructed. The authoritative snapshot is the v1.1 schema/event JSON plus cached logs. Instructor may say idempotency prevents the same unit from producing duplicate consequence under the declared key; do not claim that a green run proves reliability or that every retry is safe.

**Replacement owner:** Systems Studio Lead; Assessment Lead approves event/expected-action or equivalence changes. At T-30/T-2 days validate JSON/schema, 11× normal-boundary-hidden coverage, cached log parity, action-count/idempotency tests, demo/assessment separation and accessibility. Replace by new version/checksum; never edit live section fixtures.
