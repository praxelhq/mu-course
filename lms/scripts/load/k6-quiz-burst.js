// =============================================================================
// U16 — k6 QUIZ BURST: the in-class spike. 60 students submit an armed quiz
// inside a ~60s window while a 300-VU poll floor hits /api/gates/state every
// 4 seconds (the live-propagation poll every open tab runs in class).
//
//   1. Arm a quiz for its sections (instructor console), e.g. quiz_s2.
//   2. k6 run scripts/load/k6-quiz-burst.js
//      k6 run -e BASE_URL=… -e QUIZ_ID=quiz_s2 scripts/load/k6-quiz-burst.js
//
// ⚠️  TARGET A DEV/STAGING DEPLOY WITH ENABLE_TEST_LOGIN=1 ONLY — NEVER
//     PRODUCTION. Auth rides the forge_test_user test-login cookie, which a
//     production build refuses to honour (and refuses to boot with).
//
// The target DB must be seeded (`pnpm seed`). Submits are idempotent per
// (quiz, student): 200 on the first hit, 409 "duplicate" (carrying the
// original result) on repeats — both count as success below.
// =============================================================================

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3210";
const QUIZ_ID = __ENV.QUIZ_ID || "quiz_s2";

const submitErrors = new Rate("quiz_submit_errors");
const submitDuration = new Trend("quiz_submit_duration", true);

export const options = {
  scenarios: {
    // 300 open tabs polling the gate snapshot every 4s for the whole window.
    poll_floor: {
      executor: "constant-vus",
      exec: "pollGates",
      vus: 300,
      duration: "90s",
    },
    // 60 students submitting within a ~60s window (staggered starts).
    quiz_burst: {
      executor: "per-vu-iterations",
      exec: "submitQuiz",
      vus: 60,
      iterations: 1,
      maxDuration: "75s",
      startTime: "10s",
    },
  },
  thresholds: {
    quiz_submit_errors: ["rate<0.01"], // error rate < 1%
    quiz_submit_duration: ["p(95)<1000"], // p95 submit < 1s
    http_req_failed: ["rate<0.01"],
  },
};

function pad3(n) {
  return String(n).padStart(3, "0");
}

function login(userId) {
  const jar = http.cookieJar();
  jar.set(BASE, "forge_test_user", userId);
  jar.set(BASE, "forge_welcomed", "1");
}

export function pollGates() {
  // Poll-floor VUs are students 101…400 — distinct from the submitters.
  login(`user_s${pad3(100 + (__VU % 300) + 1)}`);
  const res = http.get(`${BASE}/api/gates/state`, { tags: { page: "gates" } });
  check(res, { "gates 200": (r) => r.status === 200 });
  sleep(4);
}

export function submitQuiz() {
  // Submitters are students 1…60 (all seeded; section A/B → arm the quiz for
  // those sections, or all).
  const userId = `user_s${pad3((__VU % 60) + 1)}`;
  login(userId);

  // Spread the 60 submits across the ~60s window.
  sleep(Math.random() * 55);

  // Learn the question count, then answer (option 0 for every question).
  const quizRes = http.get(`${BASE}/api/quiz/${QUIZ_ID}`, { tags: { page: "quiz" } });
  const ok = check(quizRes, { "quiz fetch 200": (r) => r.status === 200 });
  if (!ok) {
    submitErrors.add(1);
    return;
  }
  if (quizRes.json("status") === "attempted") {
    // This seeded student already sat the quiz — a real student would see the
    // "already submitted" card and never POST. Not an error.
    submitErrors.add(0);
    return;
  }
  const questions = quizRes.json("quiz.questions") || [];
  const answers = Array.from({ length: questions.length }, () => 0);

  const res = http.post(`${BASE}/api/quiz/${QUIZ_ID}/submit`, JSON.stringify({ answers }), {
    headers: { "Content-Type": "application/json" },
    tags: { page: "quiz-submit" },
  });
  submitDuration.add(res.timings.duration);
  // 200 = graded; 409 = duplicate (idempotent repeat) — both are successes.
  const good = res.status === 200 || res.status === 409;
  submitErrors.add(good ? 0 : 1);
  check(res, { "submit 200/409": () => good });
}
