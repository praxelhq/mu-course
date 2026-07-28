import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { getStudentDashboard } from "../lib/dashboard";
import { main as runSeed } from "../prisma/seed";

// Live-DB assertions against the deterministic seed (self-skip without
// Postgres, same pattern as tests/seed.test.ts).

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

describe.skipIf(!live)("getStudentDashboard (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed(); // pristine seed data — earlier test files mutate the DB
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("shows student001 the open S2/S3 assignments with their latest submission status", async () => {
    const d = await getStudentDashboard("user_s001");
    expect(d.user.email).toBe("student001@mastersunion.org");
    expect(d.user.sectionCode).toBe("A");

    const ids = d.openAssignments.map((a) => a.id).sort();
    expect(ids).toEqual(["asg_s2_skill", "asg_s3_datamemo"]);

    const skill = d.openAssignments.find((a) => a.id === "asg_s2_skill")!;
    // student001 has a graded v1 and a graded v2 resubmission → latest is graded.
    expect(skill.submissionStatus).toBe("graded");
    expect(skill.typeTitle).toBe("Skill family");
    expect(skill.dueAt).toBeInstanceOf(Date);

    const memo = d.openAssignments.find((a) => a.id === "asg_s3_datamemo")!;
    expect(memo.submissionStatus).toBeNull(); // student001 never submitted one
  });

  it("lists student001's provisional grades with per-dimension breakdowns", async () => {
    const d = await getStudentDashboard("user_s001");
    expect(d.grades.length).toBeGreaterThan(0);
    for (const g of d.grades) {
      expect(g.provisional).toBe(true);
      expect(g.total).toBeGreaterThan(0);
      expect(g.dimensions.length).toBe(4);
      const keys = g.dimensions.map((dim) => dim.key).sort();
      expect(keys).toEqual(["craft", "functionality", "relevance", "verification-evidence"]);
    }
    // The v2 resubmission supersedes v1 — one grade per assignment.
    const titles = d.grades.map((g) => g.assignmentTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("shows team A1 (Frontier AI labs) with its members, and the unread notification", async () => {
    const d = await getStudentDashboard("user_s001");
    expect(d.team?.name).toBe("Team A1");
    expect(d.team?.sectorName).toBe("Frontier AI labs");
    expect(d.team!.members.length).toBeGreaterThanOrEqual(6);
    expect(d.team!.members.length).toBeLessThanOrEqual(8);
    expect(d.team!.members).toContain("Aarav Sharma"); // student001 themself

    expect(d.unreadNotifications.length).toBeGreaterThanOrEqual(1);
    expect(d.unreadNotifications[0].title).toBe("Your grade is ready");
  });

  it("shows the section interview window and no interview yet for student001", async () => {
    const d = await getStudentDashboard("user_s001");
    expect(d.interview.window?.label).toContain("interview");
    expect(d.interview.window!.opensAt.getTime()).toBeLessThan(
      d.interview.window!.closesAt.getTime(),
    );
    expect(d.interview.status).toBeNull();

    // student004 (user_s004) has the seeded graded interview.
    const d4 = await getStudentDashboard("user_s004");
    expect(d4.interview.status).toBe("graded");
  });

  it("resolves open assignments through the section-B gates for a section-B student", async () => {
    const d = await getStudentDashboard("user_s061"); // first student of section B
    expect(d.user.sectionCode).toBe("B");
    const ids = d.openAssignments.map((a) => a.id).sort();
    expect(ids).toEqual(["asg_s2_skill", "asg_s3_datamemo"]);
    // Locked S4+ assignments never leak in.
    expect(ids).not.toContain("asg_s4_app");
  });
});
