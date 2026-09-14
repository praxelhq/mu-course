// =============================================================================
// SHIPYARD — k6 DEADLINE-NIGHT BURST: ~480 near-simultaneous submissions
// (docs/shipyard/SPEC.md §8 / §6 — "480 near-simultaneous submissions on a
// deadline night then drain in roughly 25 minutes rather than over an hour",
// reviewer concurrency 15).
//
// Each of 480 VUs is one distinct seeded student (user_s001…user_s480) who
// submits ONE `working` checkpoint (order 3) submission — the one checkpoint
// in the routing table whose required fields are all text (see
// lib/shipyard/checkpoints.ts: liveUrl/corePath/knownGaps; liveUrl is
// liveness-checked at submit time, hence the use of https://example.com,
// which is always reachable).
//
// Most seeded students (prisma/seed-shipyard.ts BUCKET_PLAN) sit well before
// checkpoint 3 — checkpoint 3 is `locked` for them — so a 409 "not open" is
// the EXPECTED, common outcome here, not a failure. 201 (queued), 409 (locked
// / already cleared / already in review) and 429 (submit rate limit) are
// counted separately as custom Counters; only 5xx counts as a failure.
//
// After submitting, each VU polls its OWN spine every 4s until the `working`
// checkpoint's latest submission leaves `submitted`/`in_review` (a verdict
// landed) or 6 minutes pass, recording `time_to_verdict`.
//
//   k6 run scripts/load/k6-shipyard-deadline-burst.js
//   k6 run -e BASE_URL=https://shipyard-demo-production.up.railway.app scripts/load/k6-shipyard-deadline-burst.js
//   k6 run -e ONLY_OPEN=1 scripts/load/k6-shipyard-deadline-burst.js
//
// ⚠️  TARGET A DEV/STAGING/DEMO DEPLOY WITH ENABLE_TEST_LOGIN=1 ONLY — NEVER
//     PRODUCTION. This script also WRITES real ShipyardSubmission rows and
//     enqueues real reviewer jobs — running it against a shared stack burns
//     reviewer concurrency and (if OPENROUTER_API_KEY is set for real) real
//     model spend. Reset the target DB afterwards (see README-shipyard.md).
//
// --env ONLY_OPEN=1: before submitting, each VU first fetches its own spine
// and only submits if checkpoint 3 (`working`) is currently `open` — useful
// for a cleaner signal on submit-path latency once the target DB has been
// seeded/advanced so more students are actually eligible to submit.
//
// NOTE ON THE VERDICT WINDOW: at reviewer concurrency 15 with a stub or fast
// model, SPEC §6 estimates ~25 minutes to drain 480 queued reviews. This
// script's own window (60s ramp + 2m hold + up to 6m of polling per VU) is
// deliberately shorter than that — it will NOT observe every verdict land.
// That is expected; see README-shipyard.md for what the printed summary
// numbers mean.
// =============================================================================

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const ONLY_OPEN = ["1", "true", "yes"].includes((__ENV.ONLY_OPEN || "").toLowerCase());
const TOTAL_STUDENTS = 480;
const POLL_INTERVAL_S = 4;
const VERDICT_WINDOW_MS = 6 * 60 * 1000; // 6 minutes

const submitted201 = new Counter("shipyard_submit_201");
const submitted409 = new Counter("shipyard_submit_409");
const submitted429 = new Counter("shipyard_submit_429");
const submittedOther4xx = new Counter("shipyard_submit_other_4xx");
const submit5xxErrors = new Rate("shipyard_submit_5xx_errors");
const submitDuration = new Trend("shipyard_submit_duration", true);
const onlyOpenSkipped = new Counter("shipyard_only_open_skipped");
const verdictsLanded = new Counter("shipyard_verdicts_landed");
const timeToVerdict = new Trend("shipyard_time_to_verdict", true);

export const options = {
  scenarios: {
    deadline_burst: {
      executor: "ramping-vus",
      exec: "submitAndAwaitVerdict",
      startVUs: 0,
      stages: [
        { duration: "60s", target: 480 }, // ramp to full in 60s
        { duration: "2m", target: 480 }, // hold 2 minutes
      ],
      // Every VU submits once then may poll for up to 6 minutes for a
      // verdict; gracefulStop keeps those in-flight polls running past the
      // nominal 3-minute ramp+hold window instead of being cut off mid-poll.
      gracefulStop: "7m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    shipyard_submit_5xx_errors: ["rate<0.01"],
    // SPEC §8 targets p95 < 500ms on the spine in general, but this script
    // deliberately loosens the spine-read target to 800ms UNDER THE BURST
    // ITSELF: 480 VUs are concurrently writing (creating submissions,
    // enqueuing jobs, and — as verdicts land — flipping gate/grade rows)
    // while also polling reads, so read latency during the burst legitimately
    // degrades versus the steady-state baseline in k6-shipyard-baseline.js.
    // The baseline script is what enforces the strict 500ms figure.
    "http_req_duration{name:spine}": ["p(95)<800"],
  },
};

function pad3(n) {
  return String(n).padStart(3, "0");
}

function ensureLogin(userId) {
  const res = http.post(`${BASE}/api/test-login`, JSON.stringify({ userId }), {
    headers: { "Content-Type": "application/json" },
    tags: { name: "test-login" },
  });
  check(res, { "test-login 200": (r) => r.status === 200 });
}

function fetchWorkingCheckpoint() {
  const res = http.get(`${BASE}/api/shipyard/spine`, { tags: { name: "spine" } });
  if (res.status !== 200) return { ok: false, checkpoint: null };
  const checkpoints = res.json("spine.checkpoints") || [];
  const working = checkpoints.find((c) => c && c.key === "working");
  return { ok: true, checkpoint: working || null };
}

// One iteration per VU: submit once, then poll for a verdict. `done` latches
// so that if k6 ever re-invokes this VU (e.g. the ramp overshoots into a
// second iteration before the stage ends) it does not double-submit.
let done = false;

export function submitAndAwaitVerdict() {
  if (done) {
    sleep(1);
    return;
  }
  done = true;

  const userId = `user_s${pad3(__VU > TOTAL_STUDENTS ? ((__VU - 1) % TOTAL_STUDENTS) + 1 : __VU)}`;
  ensureLogin(userId);

  if (ONLY_OPEN) {
    const { ok, checkpoint } = fetchWorkingCheckpoint();
    if (!ok || !checkpoint || checkpoint.state !== "open") {
      onlyOpenSkipped.add(1);
      return;
    }
  }

  const payload = JSON.stringify({
    checkpointKey: "working",
    fields: {
      liveUrl: "https://example.com",
      corePath:
        "Load-test synthetic core path: open the app, create one item, see it appear in the list.",
      knownGaps:
        "Synthetic load-test submission (scripts/load/k6-shipyard-deadline-burst.js) — no real product behind this URL.",
    },
    files: [],
  });

  const res = http.post(`${BASE}/api/shipyard/submissions`, payload, {
    headers: { "Content-Type": "application/json" },
    tags: { name: "submit" },
  });
  submitDuration.add(res.timings.duration);

  if (res.status === 201) {
    submitted201.add(1);
    submit5xxErrors.add(0);
  } else if (res.status === 409) {
    submitted409.add(1);
    submit5xxErrors.add(0);
  } else if (res.status === 429) {
    submitted429.add(1);
    submit5xxErrors.add(0);
  } else if (res.status >= 500) {
    submit5xxErrors.add(1);
    check(res, { "submit did not 5xx": () => false });
    return; // no point polling for a verdict on a submit that failed server-side
  } else {
    // e.g. 400 (validation) / 404 (no product/checkpoint) — unexpected but
    // not a server failure; still not worth polling for a verdict.
    submittedOther4xx.add(1);
    submit5xxErrors.add(0);
    return;
  }

  if (res.status !== 201) return; // 409/429 never got queued — nothing to await

  const start = Date.now();
  while (Date.now() - start < VERDICT_WINDOW_MS) {
    sleep(POLL_INTERVAL_S);
    const { ok, checkpoint } = fetchWorkingCheckpoint();
    if (!ok || !checkpoint || !checkpoint.latestSubmission) continue;
    const status = checkpoint.latestSubmission.status;
    if (status !== "submitted" && status !== "in_review") {
      timeToVerdict.add(Date.now() - start);
      verdictsLanded.add(1);
      return;
    }
  }
  // 6 minutes passed with no verdict — expected for most of the 480 given
  // concurrency 15 and a ~25 minute drain (see the header note above).
}
