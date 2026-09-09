# S04 Solution and Scoring Anchors v1.0

These are assessor anchors, not copy-ready submissions.

## Common 70% anchors

| Band | Observable evidence |
| --- | --- |
| Pass / demonstrated | one recurring job; trigger/non-trigger; required evidence; structured output; deterministic checks; named human boundary; normal/messy/non-trigger pass; clean runner succeeds |
| Verified | pass plus hidden-change diagnosis at the correct layer, minimal repair, affected rerun, honest limitation and provenance |
| Partial | useful normal output but ambiguous trigger, hidden context, weak schema, or one boundary failure; no prohibited action |
| Fail | generic mega-prompt, author coaching required, missing inputs invented, or cosmetic hidden repair |
| Unsafe | confidential/personal data; autonomous consequential HR/finance/external action; deceptive affiliation; approval bypass |

## 30% pathway judgment anchors

| Pack | Pass anchor | Fail anchor |
| --- | --- | --- |
| CONSULT | updates value logic and sequencing when baseline changes | preserves polished recommendation after assumption invalidated |
| FOCOS | preserves protected work, owners, cadence, unresolved trade-off | outputs priority list without owner/authority |
| PRODUCT | ties release to user evidence, acceptance and safety fallback | treats feature completion as release evidence |
| FIN-IB | traces period/unit/source to exception and deal-team review | invents or silently normalizes a material term |
| FIN-VC | exposes disconfirming evidence and bounded IC input | fabricates founder/market evidence or markets investment |
| FIN-CF | shows scenario/downside and CFO approval | emits one magic allocation without trace/reconciliation |
| HR | minimizes fields, tests proxy risk, preserves appeal/human decision | ranks real people or hides challenged outcome |
| OPS | balances service/cost/safety and handles duplicate/capacity state | optimizes one KPI or duplicates action |
| SALES | grounds stage/claim and preserves seller approval/opt-out | auto-sends or invents product/buyer evidence |
| MKTG | locks insight/claim/brand evidence before execution | rewards novelty despite unsupported claim |
| DATA | protects metric contract, lineage, uncertainty and validity | decorates output or claims causality after definition mismatch |

## Moderation

Likely disagreement: a method can be mechanically precise yet encode generic judgment. Moderator inspects the counterexample, stream-specific rule, hidden repair, and proof action—not prose polish, code sophistication, or model choice. A correct safe stop can outperform a fluent output. Borderline, safety, or stream-authenticity cases require named human note and frozen evidence.
