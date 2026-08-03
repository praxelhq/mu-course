import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { toCsv } from "../lib/csv-export";
import { main as runSeed } from "../prisma/seed";

// U8 — shared CSV serializer (formula-injection neutralized; U15 reuses it)
// and the instructor matrix aggregation against the deterministic seed.

describe("toCsv", () => {
  it("serializes headers + rows with quoting for commas/quotes/newlines", () => {
    const csv = toCsv(
      ["name", "note"],
      [
        ["Sharma, Aarav", 'said "hi"'],
        ["Plain", "line1\nline2"],
      ],
    );
    expect(csv.split("\r\n")[0]).toBe("name,note");
    expect(csv).toContain('"Sharma, Aarav","said ""hi"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it("neutralizes formula-injection cells (= + - @ prefixes get a leading ')", () => {
    const csv = toCsv(
      ["a"],
      [["=SUM(A1:A9)"], ["+1234"], ["-cmd|/c calc"], ["@import"], ["normal"], ["₹-100 fine"]],
    );
    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).toContain("'+1234");
    expect(csv).toContain("'-cmd|/c calc");
    expect(csv).toContain("'@import");
    expect(csv).toContain("normal");
    expect(csv).toContain("₹-100 fine"); // only leading chars are neutralized
    expect(csv).not.toMatch(/(^|\r\n)=/);
  });
});

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

describe.skipIf(!live)("section matrix (live DB, seeded)", () => {
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

  it("section A matrix: 60 rows, all assignments as columns, latest-version statuses matching the seed", async () => {
    const { getSectionMatrix } = await import("../lib/matrix");
    const matrix = await getSectionMatrix("sec_A");
    expect(matrix.students.length).toBe(60);
    const assignmentCount = await prisma.assignment.count();
    expect(matrix.assignments.length).toBe(assignmentCount);

    // user_s001 (idx 0) has seeded skill v1 graded + v2 graded → latest v2 "graded".
    const s001 = matrix.students.find((s) => s.id === "user_s001")!;
    expect(s001.cells["asg_s2_skill"]?.status).toBe("graded");
    expect(s001.cells["asg_s2_skill"]?.version).toBe(2);

    // Team-based: every member of team_A2 shows the team workflow submission.
    const a2Members = await prisma.user.findMany({
      where: { teamId: "team_A2" },
      select: { id: true },
    });
    for (const m of a2Members) {
      const row = matrix.students.find((s) => s.id === m.id)!;
      expect(row.cells["asg_s5_workflow"]?.status).toBe("graded");
    }

    // Independent aggregation cross-check: non-blank cell count equals the
    // number of distinct (student-or-team, assignment) latest submissions.
    const subs = await prisma.submission.findMany({
      select: { assignmentId: true, userId: true, teamId: true },
    });
    const aStudents = new Set(matrix.students.map((s) => s.id));
    const teamMembers = new Map<string, string[]>();
    for (const u of await prisma.user.findMany({
      where: { sectionId: "sec_A", role: "student" },
      select: { id: true, teamId: true },
    })) {
      if (!u.teamId) continue;
      teamMembers.set(u.teamId, [...(teamMembers.get(u.teamId) ?? []), u.id]);
    }
    const expected = new Set<string>();
    for (const s of subs) {
      if (s.teamId && teamMembers.has(s.teamId)) {
        for (const m of teamMembers.get(s.teamId)!) expected.add(`${m}|${s.assignmentId}`);
      } else if (aStudents.has(s.userId)) {
        expected.add(`${s.userId}|${s.assignmentId}`);
      }
    }
    let filled = 0;
    for (const row of matrix.students) filled += Object.keys(row.cells).length;
    expect(filled).toBe(expected.size);
    expect(filled).toBeGreaterThan(0);
  });

  it("matrix CSV export: instructor-only, header row + 60 data rows, injection-safe", async () => {
    const { TEST_LOGIN_COOKIE } = await import("../lib/auth/test-login");
    const { GET } = await import("../app/api/exports/matrix/route");
    const reqAs = (userId: string) =>
      new Request("http://test.local/api/exports/matrix?section=A", {
        headers: { cookie: `${TEST_LOGIN_COOKIE}=${userId}` },
      });

    expect((await GET(reqAs("user_s001"))).status).toBe(403);

    const res = await GET(reqAs("user_instructor"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines.length).toBe(61); // header + 60 students
    expect(lines[0].toLowerCase()).toContain("student");
    // No cell begins with a formula trigger.
    for (const line of lines.slice(1)) {
      for (const cell of line.split(",")) {
        const bare = cell.replace(/^"/, "");
        expect(/^[=+@]/.test(bare)).toBe(false);
      }
    }
  });
});
