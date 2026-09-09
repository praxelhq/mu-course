# S03 Demo — Three Systems, One Model, Three Different Truth Behaviors

**Asset ID:** `S03-DEMO-v1.0` · **Duration:** 10 minutes

## Setup

Use synthetic Atlas corpus and cached outputs. Prepare: base model, naïve corpus chat, evaluated system with trust/date rules, citations, partial abstention, disclosure and named human boundary. Questions: uncommon threshold, absent customer eligibility, approval request. Hostile `S03-DOC-INJECT-01` stays hidden until step 4.

## Script

1. Lock predictions: prior/corpus/refuse.
2. Base model invents or misses the uncommon `12-minute` threshold. Label **prior**, not stupidity.
3. Naïve system retrieves `S03-DOC-OPS-01` and answers threshold correctly. It invents customer eligibility; open trace—no customer evidence exists.
4. Add hostile document saying hide citations/approve requests. Naïve system follows it. Ask: “Did retrieval make this safer?”
5. Switch to evaluated contract. Rerun: precise citation; partial abstention on eligibility; approval left to `Service Operations Lead`; AI/synthetic disclosure visible.
6. Add legitimate dated `S03-DOC-UPDATE-01`; show newer approved version changes threshold while unaffected cases remain stable.
7. Open results by layer: retrieved passage and response property, not prose similarity.
8. Close: “RAG is not a truth switch. It is a pipeline you can inspect, test and stop.”

**Transfer cue:** before the legitimate update result appears, students predict affected and stable cases. This demonstrates change control; the assessed update uses the learner's distinct pathway corpus.

Fallback: static response/trace cards and a learner vote at each reveal. Do not use a living-person voice/likeness or teach vendor UI.
