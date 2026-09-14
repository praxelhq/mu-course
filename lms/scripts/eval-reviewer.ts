// `pnpm eval:reviewer` — the fixture-agreement gate (SPEC §6.5, milestone M2.5).
//
// About ten sample submissions per checkpoint, sixty in all, each with the
// verdict a human expects. The harness runs every model in the routing table
// and prints agreement with the expected verdicts and with the other model.
// It is a RELEASE GATE: no bar, rubric, prompt or routing change reaches
// students until its numbers are recorded in docs/DECISIONS.md.
//
// M0 ships the entrypoint and exits non-zero, so the gate cannot be mistaken
// for passing before the fixtures exist. M2.5 replaces this file.

import { EVAL_MODELS } from "../lib/ai/router";

console.error("pnpm eval:reviewer — fixtures not yet recorded.");
console.error(`Models in the routing table: ${EVAL_MODELS.join(", ")}`);
console.error(
  "M2.5 records ~10 fixtures per checkpoint with expected verdicts and replaces this script.",
);
process.exit(1);
