// =============================================================================
// U16 — k6 BASELINE load: 100 concurrent students cycling the read surfaces
// (dashboard, sessions index, S3 hub, gate-state poll, notifications) with
// mixed think times.
//
//   k6 run scripts/load/k6-baseline.js
//   k6 run -e BASE_URL=https://staging.example.com scripts/load/k6-baseline.js
//
// ⚠️  TARGET A DEV/STAGING DEPLOY WITH ENABLE_TEST_LOGIN=1 ONLY — NEVER
//     PRODUCTION. Auth rides the forge_test_user test-login cookie, which a
//     production build refuses to honour (and refuses to boot with); this
//     script would both fail and be abusive against real traffic.
//
// The target DB must be seeded (`pnpm seed`) so user_s001…user_s100 exist.
// =============================================================================

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3210";

export const options = {
  scenarios: {
    baseline: {
      executor: "constant-vus",
      vus: 100,
      duration: __ENV.DURATION || "2m",
    },
  },
  thresholds: {
    // p95 < 500ms across the read endpoints; individual tags below.
    http_req_duration: ["p(95)<500"],
    "http_req_duration{page:dashboard}": ["p(95)<500"],
    "http_req_duration{page:sessions}": ["p(95)<500"],
    "http_req_duration{page:hub}": ["p(95)<500"],
    "http_req_duration{page:gates}": ["p(95)<500"],
    "http_req_duration{page:notifications}": ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

function pad3(n) {
  return String(n).padStart(3, "0");
}

export default function baseline() {
  // Each VU is one seeded student; the cookie jar keeps the session.
  const userId = `user_s${pad3((__VU % 100) + 1)}`;
  const jar = http.cookieJar();
  jar.set(BASE, "forge_test_user", userId);
  jar.set(BASE, "forge_welcomed", "1");

  const pages = [
    { url: `${BASE}/dashboard`, tag: "dashboard" },
    { url: `${BASE}/sessions`, tag: "sessions" },
    { url: `${BASE}/sessions/3`, tag: "hub" },
    { url: `${BASE}/api/gates/state`, tag: "gates" },
    { url: `${BASE}/notifications`, tag: "notifications" },
  ];

  for (const p of pages) {
    const res = http.get(p.url, { tags: { page: p.tag } });
    check(res, { [`${p.tag} 200`]: (r) => r.status === 200 });
    sleep(0.5 + Math.random() * 2.5); // mixed think time 0.5–3s
  }
}
