# S05 Pathway Packs — Controlled Execution v1.0

All packs share one event/state/approval/log envelope and V04; each changes schema, rule, failure, action, authority and proof. Fixtures are synthetic in `data/s05-stream-events-synthetic.json`.

**Pathway labels:** Consulting; FOCOS; Product Management; Investment Banking; Venture Capital; Corporate Finance; Human Resources; Supply Chain and Operations; Sales; Marketing; Data.

| Pack ID | Role / owner / decision | Payload, calculation or rule | Hidden failure → action / boundary | 30% judgment + two-minute proof |
| --- | --- | --- | --- | --- |
| `S05-CONSULT-PACK-01` | advisor associate; client COO owns pilot, partner approves, CFO consulted | baseline/value range/constraint event; exact value math D, issue interpretation M, client/partner H, mock tracker X | CFO reduces benefit → resequence/create pilot-review task; no budget commitment | implementation/change credibility; trace assumption→option→approval→task |
| `S05-FOCOS-PACK-01` | CoS operator; CEO owns priority, function lead consulted | weekly item/goal/owner/dependency/protected; missing owner stops, protected rule D | protected initiative/owner conflict → mock owner-board task; no budget allocation | explicit trade-off/cadence; show deferred item + CEO gate |
| `S05-PRODUCT-PACK-01` | PM operator; product/trust owner controls release | session incident/severity/telemetry/fallback; threshold D, diagnosis M | safety constraint/low confidence → issue + release hold; never auto-release | user outcome and fallback; trace event→hold→owner |
| `S05-FIN-IB-PACK-01` | IB analyst advisor; VP/senior team approves model/client change | filing/period/unit/value/model field; reconcile D, explain M | duplicate filing + changed covenant → deal-team exception task; no client update | transaction trace; show dedupe, normalized field, VP gate |
| `S05-FIN-VC-PACK-01` | VC associate investor; partner/IC decides advance | evidence/claim/support/counter/source; support checks D, synthesis M | unsupported retention/conflict → IC open-question task; no public recommendation | disconfirming evidence; trace claim→hold→IC |
| `S05-FIN-CF-PACK-01` | FP&A operator; CFO/budget owner authorizes | forecast/actual/request/scenario/hurdle; reconciliation D, commentary M | demand/hurdle policy changes → revise/defer queue; no spend approval | downside/control; replay scenario and CFO gate |
| `S05-HR-PACK-01` | HRBP/people analytics; HR leader decides, employee appeals | minimal aggregate request/policy/subgroup; prohibited fields + min-cell D | proxy/PII or challenge → quarantine/review/appeal case; no ranking/adverse action | dignity/fairness; show zero action and appeal owner |
| `S05-OPS-PACK-01` | operations analyst; planner acts, safety lead approves | event/order/SLA/capacity/safety/dedupe; exact SLA/idempotency D | duplicate + supplier timeout/capacity shock → one planner recovery task | service-cost-safety/idempotency; replay action count 1 |
| `S05-SALES-PACK-01` | RevOps/AE; seller approves, security consulted | CRM signal/stage/source/claim/consent; opt-out and staleness D | unsupported claim/stale signal/opt-out → approval queue or no-send | qualification/relationship; trace signal→draft→seller/no-send |
| `S05-MKTG-PACK-01` | brand strategist; brand/legal approves test | brief/claim/source/brand lock/hypothesis/metric; locked claim rules D | unsupported claim or policy lock → test-review task, never publish/buy | insight/claim/experiment; show blocked claim + approval |
| `S05-DATA-PACK-01` | analyst; metric/data owner releases | dataset/schema/tests/metric version/lineage; quality checks D, driver note M | metric definition/leakage/failed test → invalid alert, no dashboard release | validity/uncertainty; trace test→alert→owner stop |

## Referential crosswalk

Each pack binds one normal, one supplied boundary, and one hidden event in the JSON fixture, quiz families `S05-dmhx-class`, `S05-allocation`, `S05-approval-boundary`, `S05-recovery`, validator V04, common/stream anchors in `solution-anchors.md`, and proof above. Normal/boundary cards are exposed; hidden events are section-salted. Equivalent load: one seven-step map, three known runs, one injected repair/replay.

## Noun-swap audit

Every row differs in at least five authenticity fields. For example, IB deduplicates a filing and routes a normalized exception to senior deal team; HR rejects proxy/PII and creates an appealable review case; Marketing blocks a claim and routes a bounded test. A generic “create task after AI” implementation fails the 30% anchor.
