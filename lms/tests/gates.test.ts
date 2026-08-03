import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import {
  bulkCloseSession,
  bulkOpenSession,
  effectiveGateState,
  grantException,
  resolveGate,
  resolveMany,
  setGateState,
} from "../lib/gates";
import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";

// U6 gate system. The resolution rule (one function, tested exhaustively):
//   effective = open  if state==open, or state==locked && opensAt != null && opensAt <= now
//   effective = closed if state==closed (manual close always wins over opensAt)
//   effective = locked otherwise (missing row = locked)
// A target is available iff its own gate AND its parent session's gate are
// both effectively open — unless the student holds an unexpired GateException.

const NOW = new Date("2026-07-27T12:00:00Z");
const PAST = new Date("2026-07-20T00:00:00Z");
const FUTURE = new Date("2026-08-20T00:00:00Z");

// ---------------------------------------------------------------------------
// Pure resolution rule — no DB
// ---------------------------------------------------------------------------

describe("effectiveGateState truth table", () => {
  it("missing gate row is locked", () => {
    expect(effectiveGateState(null, NOW)).toBe("locked");
  });

  it("locked: opens only via a past opensAt", () => {
    expect(effectiveGateState({ state: "locked", opensAt: null }, NOW)).toBe("locked");
    expect(effectiveGateState({ state: "locked", opensAt: PAST }, NOW)).toBe("open");
    expect(effectiveGateState({ state: "locked", opensAt: NOW }, NOW)).toBe("open"); // boundary: <= now
    expect(effectiveGateState({ state: "locked", opensAt: FUTURE }, NOW)).toBe("locked");
  });

  it("open: stays open regardless of opensAt (manual toggle wins)", () => {
    expect(effectiveGateState({ state: "open", opensAt: null }, NOW)).toBe("open");
    expect(effectiveGateState({ state: "open", opensAt: PAST }, NOW)).toBe("open");
    expect(effectiveGateState({ state: "open", opensAt: FUTURE }, NOW)).toBe("open");
  });

  it("closed: stays closed regardless of opensAt (manual close always wins)", () => {
    expect(effectiveGateState({ state: "closed", opensAt: null }, NOW)).toBe("closed");
    expect(effectiveGateState({ state: "closed", opensAt: PAST }, NOW)).toBe("closed");
    expect(effectiveGateState({ state: "closed", opensAt: FUTURE }, NOW)).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// Live-DB (self-skips without Postgres, seeded once — serial files)
// ---------------------------------------------------------------------------

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

describe.skipIf(!live)("gate system (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });

  const GATE_STATES = ["locked", "open", "closed"] as const;

  async function forceGate(
    targetType: "session" | "material" | "assignment" | "quiz",
    targetId: string,
    sectionId: string,
    state: (typeof GATE_STATES)[number],
  ) {
    await prisma.gate.upsert({
      where: { targetType_targetId_sectionId: { targetType, targetId, sectionId } },
      update: { state, opensAt: null },
      create: { targetType, targetId, sectionId, state },
    });
  }

  // -------------------------------------------------------------------------
  // resolveGate: own × parent — 9 combinations
  // -------------------------------------------------------------------------

  it("resolveGate: available only when own gate AND parent session are open (9 combos)", async () => {
    for (const own of GATE_STATES) {
      for (const parent of GATE_STATES) {
        await forceGate("assignment", "asg_s4_app", "sec_A", own);
        await forceGate("session", "spage_4", "sec_A", parent);
        const available = await resolveGate(
          {
            targetType: "assignment",
            targetId: "asg_s4_app",
            sectionId: "sec_A",
            parentSessionPageId: "spage_4",
          },
          NOW,
        );
        expect(available, `own=${own} parent=${parent}`).toBe(own === "open" && parent === "open");
      }
    }
  });

  it("resolveGate: missing gate row means locked", async () => {
    await prisma.gate.deleteMany({
      where: { targetType: "assignment", targetId: "asg_s4_app", sectionId: "sec_A" },
    });
    await forceGate("session", "spage_4", "sec_A", "open");
    const available = await resolveGate(
      {
        targetType: "assignment",
        targetId: "asg_s4_app",
        sectionId: "sec_A",
        parentSessionPageId: "spage_4",
      },
      NOW,
    );
    expect(available).toBe(false);
    // A session with no gate row is locked too — child open gate doesn't help.
    await forceGate("assignment", "asg_s4_app", "sec_A", "open");
    await prisma.gate.deleteMany({
      where: { targetType: "session", targetId: "spage_4", sectionId: "sec_A" },
    });
    expect(
      await resolveGate(
        {
          targetType: "assignment",
          targetId: "asg_s4_app",
          sectionId: "sec_A",
          parentSessionPageId: "spage_4",
        },
        NOW,
      ),
    ).toBe(false);
    // Restore for later tests.
    await forceGate("session", "spage_4", "sec_A", "locked");
    await forceGate("assignment", "asg_s4_app", "sec_A", "locked");
  });

  it("resolveGate: a scheduled opensAt in the past opens a locked gate", async () => {
    await forceGate("session", "spage_4", "sec_A", "open");
    await prisma.gate.update({
      where: {
        targetType_targetId_sectionId: {
          targetType: "assignment",
          targetId: "asg_s4_app",
          sectionId: "sec_A",
        },
      },
      data: { state: "locked", opensAt: PAST },
    });
    expect(
      await resolveGate(
        {
          targetType: "assignment",
          targetId: "asg_s4_app",
          sectionId: "sec_A",
          parentSessionPageId: "spage_4",
        },
        NOW,
      ),
    ).toBe(true);
    await forceGate("assignment", "asg_s4_app", "sec_A", "locked");
    await forceGate("session", "spage_4", "sec_A", "locked");
  });

  // -------------------------------------------------------------------------
  // Per-student exceptions
  // -------------------------------------------------------------------------

  it("exception: closed assignment becomes available for the excepted user only", async () => {
    await forceGate("session", "spage_3", "sec_A", "open");
    await forceGate("assignment", "asg_s3_datamemo", "sec_A", "closed");

    await grantException({
      targetType: "assignment",
      targetId: "asg_s3_datamemo",
      sectionId: "sec_A",
      userId: "user_s001",
      grantedBy: "user_instructor",
    });

    const ref = {
      targetType: "assignment" as const,
      targetId: "asg_s3_datamemo",
      sectionId: "sec_A",
      parentSessionPageId: "spage_3",
    };
    expect(await resolveGate({ ...ref, userId: "user_s001" }, NOW)).toBe(true);
    expect(await resolveGate({ ...ref, userId: "user_s002" }, NOW)).toBe(false);
    expect(await resolveGate(ref, NOW)).toBe(false); // no user context = no exception
  });

  it("exception: an expired exception is ignored", async () => {
    await grantException({
      targetType: "assignment",
      targetId: "asg_s3_datamemo",
      sectionId: "sec_A",
      userId: "user_s003",
      grantedBy: "user_instructor",
      expiresAt: PAST,
    });
    expect(
      await resolveGate(
        {
          targetType: "assignment",
          targetId: "asg_s3_datamemo",
          sectionId: "sec_A",
          parentSessionPageId: "spage_3",
          userId: "user_s003",
        },
        NOW,
      ),
    ).toBe(false);
    // Restore the seeded open state.
    await forceGate("assignment", "asg_s3_datamemo", "sec_A", "open");
  });

  // -------------------------------------------------------------------------
  // setGateState + audit
  // -------------------------------------------------------------------------

  it("setGateState writes an AuditLog row with before/after; repeat set is idempotent", async () => {
    await forceGate("assignment", "asg_s5_workflow", "sec_B", "locked");
    const auditBefore = await prisma.auditLog.count({
      where: { action: "gate.set", targetId: "asg_s5_workflow" },
    });

    const r1 = await setGateState({
      targetType: "assignment",
      targetId: "asg_s5_workflow",
      sectionId: "sec_B",
      state: "open",
      actorId: "user_instructor",
    });
    expect(r1.changed).toBe(true);
    expect(r1.before).toBe("locked");
    expect(r1.after).toBe("open");

    const rows = await prisma.auditLog.findMany({
      where: { action: "gate.set", targetId: "asg_s5_workflow" },
      orderBy: { createdAt: "desc" },
    });
    expect(rows.length).toBe(auditBefore + 1);
    const entry = rows[0];
    expect(entry.actorId).toBe("user_instructor");
    expect((entry.before as { state?: string })?.state).toBe("locked");
    expect((entry.after as { state?: string })?.state).toBe("open");

    // Double-toggle to the same state: no state change, no extra audit row.
    const r2 = await setGateState({
      targetType: "assignment",
      targetId: "asg_s5_workflow",
      sectionId: "sec_B",
      state: "open",
      actorId: "user_instructor",
    });
    expect(r2.changed).toBe(false);
    expect(r2.after).toBe("open");
    expect(
      await prisma.auditLog.count({ where: { action: "gate.set", targetId: "asg_s5_workflow" } }),
    ).toBe(auditBefore + 1);
    await forceGate("assignment", "asg_s5_workflow", "sec_B", "locked");
  });

  // -------------------------------------------------------------------------
  // bulkOpenSession / bulkCloseSession
  // -------------------------------------------------------------------------

  it("bulkOpenSession opens the session and every child; bulkCloseSession closes them", async () => {
    const page = await prisma.sessionPage.findUniqueOrThrow({ where: { id: "spage_4" } });
    const childIds = [
      ...page.orderedMaterialIds,
      ...page.linkedAssignmentIds,
      ...page.linkedQuizIds,
    ];
    expect(childIds.length).toBeGreaterThan(0);

    const auditBefore = await prisma.auditLog.count({ where: { action: "gate.set" } });
    await bulkOpenSession("spage_4", "sec_C", "user_instructor");

    const gates = await prisma.gate.findMany({
      where: { sectionId: "sec_C", targetId: { in: ["spage_4", ...childIds] } },
    });
    expect(gates.length).toBe(1 + childIds.length);
    for (const g of gates) expect(g.state, g.targetId).toBe("open");

    // One audit row per gate that actually changed state.
    const auditAfter = await prisma.auditLog.count({ where: { action: "gate.set" } });
    expect(auditAfter).toBe(auditBefore + 1 + childIds.length);

    await bulkCloseSession("spage_4", "sec_C", "user_instructor");
    const closed = await prisma.gate.findMany({
      where: { sectionId: "sec_C", targetId: { in: ["spage_4", ...childIds] } },
    });
    for (const g of closed) expect(g.state, g.targetId).toBe("closed");
  });

  // -------------------------------------------------------------------------
  // Snapshot endpoint
  // -------------------------------------------------------------------------

  function get(userId: string, qs = "") {
    return new Request(`http://test.local/api/gates/state${qs}`, {
      headers: { cookie: `${TEST_LOGIN_COOKIE}=${userId}` },
    });
  }

  it("snapshot: version changes when a gate flips, ifVersion short-circuits", async () => {
    const { GET } = await import("../app/api/gates/state/route");

    const res1 = await GET(get("user_instructor", "?sectionId=sec_D"));
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(typeof body1.version).toBe("string");
    expect(Array.isArray(body1.gates)).toBe(true);
    expect(body1.gates.length).toBeGreaterThan(0);
    for (const g of body1.gates) expect(g.sectionId).toBe("sec_D");

    // ifVersion matching → cheap unchanged response.
    const res2 = await GET(get("user_instructor", `?sectionId=sec_D&ifVersion=${body1.version}`));
    const body2 = await res2.json();
    expect(body2.unchanged).toBe(true);
    expect(body2.version).toBe(body1.version);

    // Flip a gate → version changes and the row shows the new state.
    await setGateState({
      targetType: "assignment",
      targetId: "asg_s4_app",
      sectionId: "sec_D",
      state: "open",
      actorId: "user_instructor",
    });
    const res3 = await GET(get("user_instructor", `?sectionId=sec_D&ifVersion=${body1.version}`));
    const body3 = await res3.json();
    expect(body3.unchanged).toBeUndefined();
    expect(body3.version).not.toBe(body1.version);
    const row = body3.gates.find(
      (g: { targetId: string; targetType: string }) =>
        g.targetType === "assignment" && g.targetId === "asg_s4_app",
    );
    expect(row.state).toBe("open");
    await setGateState({
      targetType: "assignment",
      targetId: "asg_s4_app",
      sectionId: "sec_D",
      state: "locked",
      actorId: "user_instructor",
    });
  });

  it("snapshot: a student is scoped to their own section (403 on another)", async () => {
    const { GET } = await import("../app/api/gates/state/route");
    const forbidden = await GET(get("user_s001", "?sectionId=sec_B"));
    expect(forbidden.status).toBe(403);

    const own = await GET(get("user_s001"));
    expect(own.status).toBe(200);
    const body = await own.json();
    expect(body.gates.length).toBeGreaterThan(0);
    for (const g of body.gates) expect(g.sectionId).toBe("sec_A"); // user_s001 is section A
  });

  it("snapshot: reports effective state — a locked gate with a past opensAt shows open", async () => {
    const { GET } = await import("../app/api/gates/state/route");
    await prisma.gate.update({
      where: {
        targetType_targetId_sectionId: {
          targetType: "session",
          targetId: "spage_5",
          sectionId: "sec_E",
        },
      },
      data: { state: "locked", opensAt: PAST },
    });
    const res = await GET(get("user_instructor", "?sectionId=sec_E"));
    const body = await res.json();
    const row = body.gates.find(
      (g: { targetId: string; targetType: string }) =>
        g.targetType === "session" && g.targetId === "spage_5",
    );
    expect(row.state).toBe("open");
    await prisma.gate.update({
      where: {
        targetType_targetId_sectionId: {
          targetType: "session",
          targetId: "spage_5",
          sectionId: "sec_E",
        },
      },
      data: { state: "locked", opensAt: null },
    });
  });

  it("resolveMany batches a section's effective states with a stable version", async () => {
    const a = await resolveMany("sec_F", NOW);
    const b = await resolveMany("sec_F", NOW);
    expect(a.version).toBe(b.version);
    expect(a.rows.length).toBeGreaterThan(0);
    const open = a.rows.filter((r) => r.targetType === "assignment" && r.state === "open");
    expect(open.map((r) => r.targetId).sort()).toEqual(["asg_s2_skill", "asg_s3_datamemo"]);
  });

  // -------------------------------------------------------------------------
  // Set endpoint: close-with-pending confirmation
  // -------------------------------------------------------------------------

  function post(userId: string, body: unknown) {
    return new Request("http://test.local/api/gates/set", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        cookie: `${TEST_LOGIN_COOKIE}=${userId}`,
      },
    });
  }

  it("closing an assignment with draft submissions needs confirmation; confirmed:true closes", async () => {
    const { POST } = await import("../app/api/gates/set/route");
    // Seed: asg_s6_map has a draft submission from team_H4 (section H).
    const draftCount = await prisma.submission.count({
      where: {
        assignmentId: "asg_s6_map",
        status: "draft",
        user: { sectionId: "sec_H" },
      },
    });
    expect(draftCount).toBeGreaterThan(0);

    const res1 = await POST(
      post("user_instructor", {
        targetType: "assignment",
        targetId: "asg_s6_map",
        sectionId: "sec_H",
        state: "closed",
      }),
    );
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.needsConfirm).toBe(true);
    expect(body1.draftCount).toBe(draftCount);
    // No state change happened.
    const gate1 = await prisma.gate.findUnique({
      where: {
        targetType_targetId_sectionId: {
          targetType: "assignment",
          targetId: "asg_s6_map",
          sectionId: "sec_H",
        },
      },
    });
    expect(gate1?.state).toBe("locked");

    const res2 = await POST(
      post("user_instructor", {
        targetType: "assignment",
        targetId: "asg_s6_map",
        sectionId: "sec_H",
        state: "closed",
        confirmed: true,
      }),
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.ok).toBe(true);
    expect(body2.state).toBe("closed");
    const gate2 = await prisma.gate.findUnique({
      where: {
        targetType_targetId_sectionId: {
          targetType: "assignment",
          targetId: "asg_s6_map",
          sectionId: "sec_H",
        },
      },
    });
    expect(gate2?.state).toBe("closed");
    await forceGate("assignment", "asg_s6_map", "sec_H", "locked");
  });

  it("set endpoint rejects students", async () => {
    const { POST } = await import("../app/api/gates/set/route");
    const res = await POST(
      post("user_s001", {
        targetType: "assignment",
        targetId: "asg_s2_skill",
        sectionId: "sec_A",
        state: "closed",
      }),
    );
    expect(res.status).toBe(403);
  });
});
