import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { prisma } from "@/lib/db";
import {
  listSections,
  loadReviewQueue,
  loadSectionMatrix,
  loadStudentFile,
  matrixCsvRows,
  matrixVersion,
  resolveSection,
  summariseSection,
  type MatrixCheckpoint,
  type MatrixRow,
  type SectionMatrix,
} from "@/lib/shipyard/instructor";
import { DEMO_PERSONAS, demoLandingPath } from "@/lib/shipyard/demo-personas";
import { checkpointId } from "@/lib/shipyard/checkpoints";
import { toCsv } from "@/lib/csv-export";

// ---------------------------------------------------------------------------
// Pure: which section, what hash, what sentence, what CSV
// ---------------------------------------------------------------------------

const SECTIONS = [
  { id: "sec_A", code: "A", name: "Section A" },
  { id: "sec_B", code: "B", name: "Section B" },
  { id: "sec_C", code: "C", name: "Section C" },
];

describe("resolveSection", () => {
  it("honours an explicit code above everything else", () => {
    expect(resolveSection(SECTIONS, "C", "sec_B")?.id).toBe("sec_C");
    expect(resolveSection(SECTIONS, "c", "sec_B")?.id).toBe("sec_C");
  });

  it("puts an instructor in their own section by default", () => {
    expect(resolveSection(SECTIONS, null, "sec_B")?.id).toBe("sec_B");
  });

  it("falls back to the first section for an admin, or an unknown code", () => {
    expect(resolveSection(SECTIONS, null, null)?.id).toBe("sec_A");
    expect(resolveSection(SECTIONS, "Z", null)?.id).toBe("sec_A");
  });

  it("has nothing to resolve with no sections", () => {
    expect(resolveSection([], "A", "sec_A")).toBeNull();
  });
});

const CPS: MatrixCheckpoint[] = [
  { id: "c1", key: "idea", order: 1, title: "Idea" },
  { id: "c2", key: "design", order: 2, title: "Design" },
];

function row(userId: string, states: ("locked" | "open" | "passed")[], flags: Partial<{
  returned: boolean;
  inReview: boolean;
}> = {}): MatrixRow {
  return {
    userId,
    name: userId,
    email: `${userId}@example.com`,
    productName: "Thing",
    cells: CPS.map((cp, i) => ({
      checkpointId: cp.id,
      state: states[i],
      returned: i === 0 ? Boolean(flags.returned) : false,
      inReview: i === 0 ? Boolean(flags.inReview) : false,
      attempts: 0,
      passedAt: states[i] === "passed" ? "2026-09-01T00:00:00.000Z" : null,
      manuallyOpened: false,
    })),
  };
}

describe("matrixVersion", () => {
  it("is stable for an unchanged matrix", () => {
    const rows = [row("a", ["passed", "open"]), row("b", ["open", "locked"])];
    expect(matrixVersion(rows, CPS)).toBe(matrixVersion(rows, CPS));
  });

  it("moves when a gate moves", () => {
    const before = matrixVersion([row("a", ["open", "locked"])], CPS);
    const after = matrixVersion([row("a", ["passed", "open"])], CPS);
    expect(after).not.toBe(before);
  });

  it("moves when a submission comes back returned, without the gate moving", () => {
    const before = matrixVersion([row("a", ["open", "locked"])], CPS);
    const after = matrixVersion([row("a", ["open", "locked"], { returned: true })], CPS);
    expect(after).not.toBe(before);
  });
});

describe("summariseSection", () => {
  it("names the checkpoint most of the section is standing at", () => {
    const rows = [
      row("a", ["passed", "open"]),
      row("b", ["passed", "open"]),
      row("c", ["open", "locked"]),
    ];
    const counts = [
      { checkpointId: "c1", passed: 2, open: 1, returned: 0, inReview: 0 },
      { checkpointId: "c2", passed: 0, open: 2, returned: 0, inReview: 0 },
    ];
    const summary = summariseSection(rows, CPS, counts);
    expect(summary).toEqual({ order: 2, title: "Design", cleared: 0, total: 3 });
  });

  it("says nothing about an empty section", () => {
    expect(summariseSection([], CPS, [])).toBeNull();
  });
});

describe("matrixCsvRows", () => {
  const matrix: SectionMatrix = {
    section: { id: "sec_A", code: "A", name: "Section A" },
    checkpoints: CPS,
    rows: [row("a", ["passed", "open"], {}), row("b", ["open", "locked"], { returned: true })],
    counts: [],
    summary: null,
    version: "x",
  };

  it("carries a state, a date and an attempt count per checkpoint", () => {
    const { headers, rows } = matrixCsvRows(matrix);
    expect(headers.slice(0, 4)).toEqual(["Name", "Email", "Section", "Product"]);
    expect(headers).toHaveLength(4 + CPS.length * 3);
    expect(headers[4]).toBe("1. Idea — state");
    expect(rows[0].slice(0, 4)).toEqual(["a", "a@example.com", "A", "Thing"]);
    expect(rows[0][4]).toBe("passed");
    expect(rows[0][5]).toBe("2026-09-01T00:00:00.000Z");
  });

  it("reports what the student is holding, not just the gate", () => {
    const { rows } = matrixCsvRows(matrix);
    expect(rows[1][4]).toBe("returned");
  });

  it("survives the CSV serializer without a formula in it", () => {
    const { headers, rows } = matrixCsvRows(matrix);
    const csv = toCsv(headers, rows);
    expect(csv.split("\r\n")[0]).toContain("Name,Email,Section,Product");
    expect(csv).not.toMatch(/\n=/);
  });
});

describe("demoLandingPath", () => {
  it("sends students to the spine and staff to the matrix", () => {
    expect(demoLandingPath({ role: "student" })).toBe("/shipyard");
    expect(demoLandingPath({ role: "instructor" })).toBe("/shipyard/instructor");
    expect(demoLandingPath({ role: "admin" })).toBe("/shipyard/instructor");
  });
});

// ---------------------------------------------------------------------------
// Live: the seeded database
// ---------------------------------------------------------------------------

describe("the faculty queries, against the seed", () => {
  let seeded = false;

  beforeAll(async () => {
    seeded = (await prisma.shipyardProduct.count()) > 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists the eight sections in order", async () => {
    if (!seeded) return;
    const sections = await listSections();
    expect(sections.map((s) => s.code)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
  });

  it("builds a full section matrix: every student, every checkpoint", async () => {
    if (!seeded) return;
    const matrix = await loadSectionMatrix("sec_A");
    expect(matrix).not.toBeNull();
    expect(matrix!.section.code).toBe("A");
    expect(matrix!.checkpoints).toHaveLength(6);
    expect(matrix!.rows.length).toBeGreaterThanOrEqual(60);
    for (const row of matrix!.rows) {
      expect(row.cells).toHaveLength(6);
    }
    expect(matrix!.version).toMatch(/^[0-9a-f]{16}$/);
  });

  it("agrees with ShipyardCheckpointState rather than re-deriving the gate", async () => {
    if (!seeded) return;
    const matrix = await loadSectionMatrix("sec_A");
    const rows = await prisma.shipyardCheckpointState.findMany({
      where: { product: { user: { sectionId: "sec_A" } } },
      select: { state: true, checkpointId: true, product: { select: { userId: true } } },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const stored of rows) {
      const cell = matrix!.rows
        .find((r) => r.userId === stored.product.userId)
        ?.cells.find((c) => c.checkpointId === stored.checkpointId);
      expect(cell?.state, `${stored.product.userId}`).toBe(stored.state);
    }
  });

  it("counts each checkpoint's four populations, and they add up", async () => {
    if (!seeded) return;
    const matrix = await loadSectionMatrix("sec_A");
    for (const cp of matrix!.checkpoints) {
      const count = matrix!.counts.find((c) => c.checkpointId === cp.id)!;
      const locked = matrix!.rows.filter(
        (r) => r.cells.find((c) => c.checkpointId === cp.id)?.state === "locked",
      ).length;
      expect(count.passed + count.open + count.returned + count.inReview + locked).toBe(
        matrix!.rows.length,
      );
    }
  });

  it("names a checkpoint in the section summary", async () => {
    if (!seeded) return;
    const matrix = await loadSectionMatrix("sec_A");
    expect(matrix!.summary).not.toBeNull();
    expect(matrix!.summary!.total).toBe(matrix!.rows.length);
    expect(matrix!.summary!.order).toBeGreaterThanOrEqual(1);
    expect(matrix!.summary!.cleared).toBeLessThanOrEqual(matrix!.summary!.total);
  });

  it("has nothing for a section that does not exist", async () => {
    if (!seeded) return;
    expect(await loadSectionMatrix("sec_ZZZ")).toBeNull();
  });

  it("opens one student's whole file: product, gates, attempts, verdicts", async () => {
    if (!seeded) return;
    const file = await loadStudentFile("user_s006");
    expect(file).not.toBeNull();
    expect(file!.user.sectionCode).toBe("A");
    expect(file!.product).not.toBeNull();
    expect(file!.checkpoints).toHaveLength(6);

    const money = file!.checkpoints.find((c) => c.key === "money")!;
    // The write-up passed; the tracker still says payments are not live, so the
    // gate stays open and the signal strip has to say which half is missing.
    expect(money.state).toBe("open");
    expect(money.signals).not.toBeNull();
    expect(money.signals!.find((s) => s.name === "paymentsLive")?.met).toBe(false);
    expect(money.submissions.length).toBeGreaterThan(0);
    expect(money.submissions[0].reviews[0].verdict).toBe("pass");
    // The internal rubric never leaves the data layer, only the reasons do.
    expect(Object.keys(money.submissions[0].reviews[0])).not.toContain("rubricScores");
  });

  it("carries the same grade line the student sees", async () => {
    if (!seeded) return;
    const file = await loadStudentFile("user_s006");
    // Not null: a student with a product always has the line, even with no
    // numbers in it yet — the drill-down and the spine read one function.
    expect(file!.grade).not.toBeNull();
    expect(file!.grade!.components.map((c) => c.key)).toEqual([
      "productQuality",
      "realNumbers",
      "workflow",
      "distribution",
    ]);
    expect(file!.grade!.components.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it("carries the checkpoint 3 render key so the drill-down can show it", async () => {
    if (!seeded) return;
    const file = await loadStudentFile("user_s006");
    const working = file!.checkpoints.find((c) => c.key === "working")!;
    expect(working.submissions[0].reviews[0].screenshotKey).toMatch(/\.png$/);
  });

  it("returns null rather than an empty shell for an unknown student", async () => {
    if (!seeded) return;
    expect(await loadStudentFile("user_nobody")).toBeNull();
  });

  it("lists only unresolved low-confidence reviews, newest first", async () => {
    if (!seeded) return;
    const queue = await loadReviewQueue(20);
    expect(queue.length).toBeGreaterThan(0);
    for (const entry of queue) {
      expect(entry.confidence).toBeLessThan(0.7);
      expect(entry.studentName).not.toBe("");
      expect(entry.checkpointOrder).toBeGreaterThanOrEqual(1);
    }
    const times = queue.map((e) => Date.parse(e.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const unresolved = await prisma.shipyardReview.count({
      where: { needsHuman: true, humanResolvedAt: null },
    });
    expect(queue.length).toBe(Math.min(20, unresolved));
  });
});

// ---------------------------------------------------------------------------
// The demo cast has to be real, or the picker offers broken logins
// ---------------------------------------------------------------------------

describe("the demo personas", () => {
  let seeded = false;

  beforeAll(async () => {
    seeded = (await prisma.shipyardProduct.count()) > 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("names accounts that exist, with the roles they claim", async () => {
    if (!seeded) return;
    const users = await prisma.user.findMany({
      where: { id: { in: DEMO_PERSONAS.map((p) => p.id) } },
      select: { id: true, role: true, section: { select: { code: true } } },
    });
    expect(users).toHaveLength(DEMO_PERSONAS.length);
    for (const persona of DEMO_PERSONAS) {
      const user = users.find((u) => u.id === persona.id)!;
      expect(user.role, persona.id).toBe(persona.role);
      if (persona.section) expect(user.section?.code, persona.id).toBe(persona.section);
    }
  });

  it("puts each student persona in the state its line promises", async () => {
    if (!seeded) return;
    const stateOf = async (userId: string) => {
      const file = await loadStudentFile(userId);
      return Object.fromEntries(file!.checkpoints.map((c) => [c.key, c.state]));
    };

    // Fresh: checkpoint 1 open, nothing behind it.
    expect(await stateOf("user_s001")).toMatchObject({ idea: "open", design: "locked" });

    // Returned and in-review are both still on checkpoint 1.
    for (const id of ["user_s003", "user_s008"]) {
      expect((await stateOf(id)).idea, id).toBe("open");
    }
    const returned = await loadStudentFile("user_s003");
    expect(returned!.checkpoints[0].submissions[0].status).toBe("returned");
    const inReview = await loadStudentFile("user_s008");
    expect(inReview!.checkpoints[0].submissions[0].status).toBe("in_review");

    // Mid-course: three cleared, standing at money.
    expect(await stateOf("user_s018")).toMatchObject({
      idea: "passed",
      design: "passed",
      working: "passed",
      money: "open",
    });

    // Flag-blocked: real money, real customer, and a blocking flag that makes
    // every metric signal false.
    const flagged = await loadStudentFile("user_s054");
    const launch = flagged!.checkpoints.find((c) => c.key === "launch")!;
    expect(launch.state).not.toBe("passed");
    expect(launch.signals!.find((s) => s.name === "noBlockingFlags")?.met).toBe(false);

    // Complete.
    const done = await stateOf("user_s072");
    expect(Object.values(done).every((s) => s === "passed")).toBe(true);
  });

  it("points at the six seeded checkpoints, not invented ids", async () => {
    if (!seeded) return;
    const file = await loadStudentFile("user_s001");
    expect(file!.checkpoints.map((c) => c.id)).toEqual([
      checkpointId("idea"),
      checkpointId("design"),
      checkpointId("working"),
      checkpointId("money"),
      checkpointId("workflow"),
      checkpointId("launch"),
    ]);
  });
});
