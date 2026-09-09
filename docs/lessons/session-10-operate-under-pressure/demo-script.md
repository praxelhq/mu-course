# S10 Neutral Demo — Inspect Before You Reprompt

**5 minutes; toy inventory only; never reuse assessed field names/numbers.**

1. At minute 0, show the system recommending reorder for every row. Ask: “better prompt, or inspect evidence path?” Freeze vote, one-line rationale and confidence before readiness/setup continues; reveal nothing yet.
2. Open event IDs: duplicated records arrived after a schema adapter changed. Name input/schema + deterministic idempotency, not “hallucination.”
3. Add duplicate-ID check; version the patch; rerun. One ambiguous record remains.
4. Run guardrail. Lower confidence and route ambiguous record to human review rather than claiming success.
5. Model 45-second defence: “event IDs showed duplication; I changed dedupe, reran, removed duplicate orders; one ambiguous record remains with planner approval.”
6. Transfer question: “What evidence would justify changing the model instead?”

Static fallback: four screenshots/tables and a paper diff. Students still predict, inspect, patch and classify partial success. Do not expose any S10 content-pack schema or hidden defect.
