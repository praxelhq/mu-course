import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";
import { getBestOfThreeAvg } from "../lib/quizzes";
import { getGradeLine } from "../lib/scoring/assemble";
import { getPeerOverview } from "../lib/scoring/overview";

// U15 — peer checkpoint API validation, the near-identical safeguard against
// the seeded fixture (team_A1), and the assembled grade line. Live-DB tests
// against the deterministic seed (self-skip without Postgres).
//
// Seed facts used below:
//   team_A1 = user_s001…user_s008 (8 members), checkpoint-1 reviews seeded
//   with a constant rng → every reviewer allocated [15,15,14,14,14,14,14]
//   (spread 1) and rated everyone exactly 4 → the near-identical fixture.
//   ConfigKV peer_checkpoint = {active: 2} → checkpoint 2 is submittable.
//   user_s001 has a graded v2 skill resubmission (sub_041_v2) and sat the
//   diagnostic DPDP quiz (which must never feed the quiz component).

async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient();
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect();
  }
}

const live = await dbReachable();

describe.skipIf(!live)("U15 peer review + grade line (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed(); // pristine world — earlier test files mutate the DB
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma?.$disconnect();
  });

  const TEAMMATES = ["user_s002", "user_s003", "user_s004", "user_s005", "user_s006", "user_s007", "user_s008"];
  const ratings = { reliability: 4, communication: 3, helpfulness: 5 };

  function post(userId: string | null, allocations: unknown) {
    return import("../app/api/peer-review/route").then(({ POST }) =>
      POST(
        new Request("http://localhost/api/peer-review", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(userId ? { cookie: `${TEST_LOGIN_COOKIE}=${userId}` } : {}),
          },
          body: JSON.stringify({ allocations }),
        }),
      ),
    );
  }

  const evenSplit = (first = 16) =>
    TEAMMATES.map((id, i) => ({ revieweeId: id, points: i === 0 ? first : 14, ratings }));

  // --- API validation ------------------------------------------------------

  it("rejects an unauthenticated submission (401)", async () => {
    const res = await post(null, evenSplit());
    expect(res.status).toBe(401);
  });

  it("rejects points that do not sum to exactly 100 (422)", async () => {
    const res = await post("user_s001", evenSplit(20)); // 20+14×6 = 104
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toContain("100");
  });

  it("rejects self-allocation (422)", async () => {
    const allocations = [
      { revieweeId: "user_s001", points: 16, ratings },
      ...TEAMMATES.slice(1).map((id) => ({ revieweeId: id, points: 14, ratings })),
    ];
    const res = await post("user_s001", allocations);
    expect(res.status).toBe(422);
  });

  it("rejects a submission that misses a teammate (422)", async () => {
    const allocations = TEAMMATES.slice(0, 6).map((id, i) => ({
      revieweeId: id,
      points: i === 0 ? 20 : 16, // 20+16×5 = 100 — sum is fine, coverage is not
      ratings,
    }));
    const res = await post("user_s001", allocations);
    expect(res.status).toBe(422);
  });

  it("rejects out-of-range ratings (422)", async () => {
    const bad = evenSplit().map((a, i) =>
      i === 0 ? { ...a, ratings: { reliability: 6, communication: 3, helpfulness: 5 } } : a,
    );
    const res = await post("user_s001", bad);
    expect(res.status).toBe(422);
  });

  it("accepts a valid checkpoint-2 submission and allows overwrite while active", async () => {
    const first = await post("user_s001", evenSplit());
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, checkpoint: 2, saved: 7 });

    const rows = await prisma.peerReview.findMany({
      where: { checkpoint: 2, reviewerId: "user_s001" },
    });
    expect(rows).toHaveLength(7);
    expect(rows.reduce((s, r) => s + r.pointsAllocated, 0)).toBe(100);

    // Resubmit with a different split — idempotent upsert, still 7 rows.
    const second = await post(
      "user_s001",
      TEAMMATES.map((id, i) => ({ revieweeId: id, points: i === 0 ? 40 : 10, ratings })),
    );
    expect(second.status).toBe(200);
    const after = await prisma.peerReview.findMany({
      where: { checkpoint: 2, reviewerId: "user_s001" },
    });
    expect(after).toHaveLength(7);
    expect(after.find((r) => r.revieweeId === "user_s002")?.pointsAllocated).toBe(40);

    // Clean up so the grade-line assertions below see the pristine seed state.
    await prisma.peerReview.deleteMany({ where: { checkpoint: 2 } });
  });

  // --- Near-identical safeguard against the seeded fixture -----------------

  it("flags team_A1 (the seeded near-identical team) and not a varied team", async () => {
    const overview = await getPeerOverview();
    const a1 = overview.find((t) => t.teamId === "team_A1")!;
    expect(a1.nearIdentical.cp1).toBe(true);
    expect(a1.submitted.cp1).toBe(8);

    // Another seeded checkpoint-1 team (varied rng allocations) is NOT flagged.
    const varied = overview.filter((t) => t.teamId !== "team_A1" && t.submitted.cp1 > 0);
    expect(varied.length).toBeGreaterThan(0);
    expect(varied.some((t) => !t.nearIdentical.cp1)).toBe(true);

    // team_A1 PCI: every member receives 15+15+14×5... the near-identical
    // split hands index-0 recipients 15 from each of 7 reviewers → 105 pts
    // → (105/700)×8 = 1.2 for user_s001 (at the clip ceiling).
    const s001 = a1.members.find((m) => m.userId === "user_s001")!;
    expect(s001.cp1).toBeCloseTo(1.2, 10);
    expect(s001.pending).toBe(false);
  });

  // --- The assembled grade line --------------------------------------------

  it("getGradeLine(user_s001) renders all 7 components with expected shapes", async () => {
    const line = await getGradeLine("user_s001");
    expect(line.lines).toHaveLength(7);
    expect(line.lines.map((l) => l.key)).toEqual([
      "vcm",
      "artifact",
      "workflow",
      "interview",
      "peer",
      "quizzes",
      "portfolio",
    ]);

    const byKey = new Map(line.lines.map((l) => [l.key, l]));

    // team_A1 has no graded map or workflow yet, and s001 has no interview.
    expect(byKey.get("vcm")!.pending).toBe(true);
    expect(byKey.get("workflow")!.pending).toBe(true);
    expect(byKey.get("interview")!.pending).toBe(true);
    for (const key of ["vcm", "workflow", "interview"] as const) {
      expect(byKey.get(key)!.raw).toBeNull();
      expect(byKey.get(key)!.weighted).toBe(0);
    }

    // Artifact: the v2 resubmission's grade supersedes v1 — raw = total × 2.5,
    // provisional because the seeded grade is provisional.
    const v2Grade = await prisma.grade.findUniqueOrThrow({ where: { id: "grade_sub_041_v2" } });
    const artifact = byKey.get("artifact")!;
    expect(artifact.raw).toBeCloseTo(v2Grade.total * 2.5, 2);
    expect(artifact.provisional).toBe(true);

    // Peer: checkpoint-1 ratings were all exactly 4 → mean 4 × 20 = 80.
    expect(byKey.get("peer")!.raw).toBeCloseTo(80, 10);

    // PCI: cp1 = 1.2 (see above), cp2 missing → combined = clip(1.2) = 1.2,
    // shown against the PCI-carrying lines even while they are pending.
    expect(line.pci.cp1).toBeCloseTo(1.2, 10);
    expect(line.pci.cp2).toBeNull();
    expect(line.pci.pci).toBeCloseTo(1.2, 10);
    expect(line.pci.pending).toBe(false);

    // Total = sum of the weighted lines.
    const sum = line.lines.reduce((s, l) => s + l.weighted, 0);
    expect(line.total).toBeCloseTo(sum, 10);
  });

  it("feeds the quiz line ONLY via getBestOfThreeAvg — the diagnostic never counts (R24)", async () => {
    // Every student sat the diagnostic DPDP quiz; it must not reach the line.
    const diagnostic = await prisma.quizAttempt.findFirst({
      where: { userId: "user_s001", quiz: { isDiagnostic: true } },
    });
    expect(diagnostic).not.toBeNull();

    const nonDiagnostic = await prisma.quizAttempt.findMany({
      where: { userId: "user_s001", quiz: { isDiagnostic: false } },
      orderBy: { scorePct: "desc" },
      take: 3,
    });
    const expected =
      nonDiagnostic.length === 0
        ? null
        : nonDiagnostic.reduce((s, a) => s + a.scorePct, 0) / nonDiagnostic.length;

    const viaRepo = await getBestOfThreeAvg("user_s001");
    expect(viaRepo).toBe(expected);

    const line = await getGradeLine("user_s001");
    const quizLine = line.lines.find((l) => l.key === "quizzes")!;
    if (expected === null) {
      expect(quizLine.raw).toBeNull();
      expect(quizLine.pending).toBe(true);
    } else {
      expect(quizLine.raw).toBeCloseTo(expected, 2);
      // Including the diagnostic would change the average unless it happens to
      // equal it exactly — assert the diagnostic-included figure differs when
      // it mathematically must.
      const withDiagnostic = [...nonDiagnostic.map((a) => a.scorePct), diagnostic!.scorePct]
        .sort((a, b) => b - a)
        .slice(0, 3);
      const tainted = withDiagnostic.reduce((s, v) => s + v, 0) / withDiagnostic.length;
      if (Math.abs(tainted - expected) > 1e-9) {
        expect(quizLine.raw).not.toBeCloseTo(tainted, 6);
      }
    }
  });

  it("an escalated interview stays pending (iv_002 → user_s101), a graded one scores (iv_001 → user_s004)", async () => {
    const graded = await getGradeLine("user_s004");
    const gradedLine = graded.lines.find((l) => l.key === "interview")!;
    expect(gradedLine.raw).toBe(79); // 22+19+21+17 from the seeded iv_001
    expect(gradedLine.pending).toBe(false);

    const escalated = await getGradeLine("user_s101");
    const escalatedLine = escalated.lines.find((l) => l.key === "interview")!;
    expect(escalatedLine.raw).toBeNull();
    expect(escalatedLine.pending).toBe(true);
    expect(escalatedLine.detail.toLowerCase()).toContain("escalated");
  });
});
