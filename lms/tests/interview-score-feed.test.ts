import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/interview/score-export", () => ({
  buildInterviewScoreCsv: async () => "name,total\nA,70\n",
}));

import { GET } from "@/app/api/exports/interviews/feed/route";

function get(qs = ""): Request {
  return new Request(`http://localhost/api/exports/interviews/feed${qs}`);
}

// This route carries every student's score to a caller with no session, so the
// only thing standing between the cohort's grades and the open internet is the
// token check. It gets its own tests.
describe("interview score feed", () => {
  beforeEach(() => vi.stubEnv("INTERVIEW_EXPORT_TOKEN", "s3cret-token"));
  afterEach(() => vi.unstubAllEnvs());

  it("serves the CSV for the right token", async () => {
    const res = await GET(get("?token=s3cret-token"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("A,70");
  });

  it("accepts the token in a header too", async () => {
    const req = new Request("http://localhost/api/exports/interviews/feed", {
      headers: { "x-export-token": "s3cret-token" },
    });
    expect((await GET(req)).status).toBe(200);
  });

  it("refuses a wrong token, a missing token, and an empty one", async () => {
    expect((await GET(get("?token=wrong"))).status).toBe(401);
    expect((await GET(get())).status).toBe(401);
    expect((await GET(get("?token="))).status).toBe(401);
  });

  it("is off entirely when no token is configured", async () => {
    vi.stubEnv("INTERVIEW_EXPORT_TOKEN", "");
    // Not 401 — 503. An unconfigured feed is closed, not merely unauthorized.
    expect((await GET(get("?token=anything"))).status).toBe(503);
  });

  it("never echoes the expected token back", async () => {
    const body = await (await GET(get("?token=wrong"))).text();
    expect(body).not.toContain("s3cret-token");
  });
});
