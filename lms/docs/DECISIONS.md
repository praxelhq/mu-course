# DECISIONS.md — append-only log

Format: date · decision · why · alternative rejected.

- 2026-07-28 · Requirements source is the ten Drive build docs vendored in `docs/build/` (00–09); the repo root's older `docs/` course material (Mission Room concept, prior assessment system) is ignored as stale · The user directed this explicitly; the Drive folder supersedes it · Rejected: treating repo course docs as requirements.
- 2026-07-28 · Realtime voice transport is LiveKit Cloud + LiveKit Agents (Deepgram → Gemini Flash → ElevenLabs) · Build prompt §2 and most of §6 pin LiveKit; a single leftover sentence in §6 says "OpenAI Realtime API" — treated as a drafting artifact · Rejected: OpenAI Realtime API.
- 2026-07-28 · Gate propagation via short-poll (3–5s) behind a client hook, not SSE · Identical UX at classroom timescales, no long-lived connection management on Railway, trivially load-testable; hook isolates a later SSE upgrade · Rejected: SSE for v1.
- 2026-07-28 · Near-duplicate detection uses content hash + Gemini embeddings (pairwise cosine within an assignment, in-memory) · Anthropic (the pinned grader) has no embeddings endpoint; the Gemini key already exists in the pinned voice stack · Rejected: adding a new embeddings-only vendor or pgvector in v1.
- 2026-07-28 · Role/section truth flows roster-row → Clerk publicMetadata (webhook pushes), never the reverse · First-sign-in Clerk accounts have empty publicMetadata; the reverse direction would overwrite imported roles · Rejected: Clerk-to-local mirroring.
- 2026-07-28 · Review-queue percentile trigger computed at queue render + batch finalise, not at grade time · Grade-time snapshots misflag early grades and miss late-context outliers · Rejected: grade-time percentile snapshot.
- 2026-07-28 · Sector claiming stays in the Praxel_MU_Sector_Tracker sheet for v0; the LMS stores each team's claimed sectorName (seeded from the 80-sector board) · Per 09_sector_board_80.md · Rejected: building a claiming UI in v1.
- 2026-07-28 · Grading eval bands are consistency checks, not accuracy ground truth · Bands are self-authored until MU digital-fluency calibration data arrives; instructor spot-validation of real early grades required before first batch-finalise · Rejected: treating a green eval as proof of grading accuracy.
- 2026-07-28 · Prisma pinned to v6 (6.x), not v7 · Prisma 7 removed `url = env(...)` datasource config (needs prisma.config.ts + driver adapters); v6 matches the pinned stack shape exactly · Rejected: Prisma 7 migration mid-scaffold.
