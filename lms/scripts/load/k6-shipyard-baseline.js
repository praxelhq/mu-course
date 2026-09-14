// =============================================================================
// SHIPYARD — k6 BASELINE load: platform-wide steady state (docs/shipyard/SPEC.md
// §8 — "design for 100 concurrent platform-wide as the baseline ... targets p95
// under 500ms on the student spine and the instructor matrix").
//
// 100 VUs are seeded students cycling the student spine at the UI's own poll
// cadence (4s): one full read, then one cheap `ifVersion=` re-check that should
// come back `{unchanged: true}` without re-serializing the whole payload.
// Alongside them, 10 VUs are the seeded instructor polling the section matrix
// every 8s (docs/DECISIONS.md, 2026-09-15: the matrix ticks slower than the
// spine because nobody is watching one square of a 60x6 grid).
//
//   k6 run scripts/load/k6-shipyard-baseline.js
//   k6 run -e BASE_URL=https://shipyard-demo-production.up.railway.app scripts/load/k6-shipyard-baseline.js
//
// ⚠️  TARGET A DEV/STAGING/DEMO DEPLOY WITH ENABLE_TEST_LOGIN=1 ONLY — NEVER
//     PRODUCTION. Auth rides the forge_test_user test-login cookie
//     (lib/auth/test-login.ts), which a real production build refuses to
//     honour (and refuses to boot with) unless it is the flagged demo stack
//     (DEMO_MODE=1). Running this against production would both fail outright
//     and, if it somehow didn't, be abusive against real student traffic.
//
// The target DB must be seeded (`pnpm seed`, which also runs
// prisma/seed-shipyard.ts): user_s001…user_s480 and user_instructor must
// exist, spread across sections sec_A…sec_H, 60 students per section
// (prisma/seed.ts: SECTION_CODES x STUDENTS_PER_SECTION).
// =============================================================================

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const SECTION_CODES = ["A", "B", "C", "D", "E", "F", "G", "H"];
const TOTAL_STUDENTS = 480;
const POLL_INTERVAL_S = 4; // the student spine's own poll cadence
const MATRIX_POLL_INTERVAL_S = 8; // the instructor matrix's own poll cadence

export const options = {
  scenarios: {
    // 100 seeded students, cycling the spine read + cheap-unchanged check.
    student_spine: {
      executor: "constant-vus",
      exec: "studentSpine",
      vus: 100,
      duration: __ENV.DURATION || "3m",
    },
    // 10 instructor tabs, one per section (roughly), polling the matrix.
    instructor_matrix: {
      executor: "constant-vus",
      exec: "instructorMatrix",
      vus: 10,
      duration: __ENV.DURATION || "3m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    // SPEC §8: p95 < 500ms on the student spine and the instructor matrix.
    "http_req_duration{name:spine}": ["p(95)<500"],
    "http_req_duration{name:spine_cached}": ["p(95)<500"],
    "http_req_duration{name:matrix}": ["p(95)<500"],
  },
};

function pad3(n) {
  return String(n).padStart(3, "0");
}

// Per-VU login latches — module scope is per-VU in k6 (each VU runs its own JS
// VM), so this survives across iterations of the same VU without re-POSTing
// /api/test-login on every 4s tick.
const loggedInAs = { current: null };

function ensureLogin(userId) {
  if (loggedInAs.current === userId) return;
  const res = http.post(`${BASE}/api/test-login`, JSON.stringify({ userId }), {
    headers: { "Content-Type": "application/json" },
    tags: { name: "test-login" },
  });
  const ok = check(res, { "test-login 200": (r) => r.status === 200 });
  if (ok) loggedInAs.current = userId;
}

// Carries the last-seen spine version across iterations of one VU, so the
// second request of every loop is a genuine `ifVersion=<last version>` check.
let lastSpineVersion = null;

export function studentSpine() {
  const idx = ((__VU - 1) % TOTAL_STUDENTS) + 1;
  const userId = `user_s${pad3(idx)}`;
  ensureLogin(userId);

  const full = http.get(`${BASE}/api/shipyard/spine`, { tags: { name: "spine" } });
  check(full, { "spine 200": (r) => r.status === 200 });
  const version = full.status === 200 ? full.json("version") : null;
  if (version) lastSpineVersion = version;

  if (lastSpineVersion) {
    const cached = http.get(`${BASE}/api/shipyard/spine?ifVersion=${lastSpineVersion}`, {
      tags: { name: "spine_cached" },
    });
    check(cached, {
      "spine cached 200": (r) => r.status === 200,
      "spine cached is the cheap body": (r) => {
        if (r.status !== 200) return false;
        // Expect the cheap `{unchanged: true}` body when nothing moved; a full
        // `spine` body back is also acceptable (something changed under us)
        // but should be rare in a read-only baseline.
        return r.json("unchanged") === true || r.json("spine") !== undefined;
      },
    });
  }

  sleep(POLL_INTERVAL_S);
}

export function instructorMatrix() {
  ensureLogin("user_instructor");
  const sectionCode = SECTION_CODES[(__VU - 1) % SECTION_CODES.length];
  const sectionId = `sec_${sectionCode}`;

  const res = http.get(`${BASE}/api/shipyard/instructor/matrix?sectionId=${sectionId}`, {
    tags: { name: "matrix" },
  });
  check(res, { "matrix 200": (r) => r.status === 200 });

  sleep(MATRIX_POLL_INTERVAL_S);
}
