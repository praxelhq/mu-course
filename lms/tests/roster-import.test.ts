import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { parseRosterCsv } from "../lib/roster-csv";
import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";

const SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// ---------------------------------------------------------------------------
// Pure CSV parsing/validation
// ---------------------------------------------------------------------------

describe("parseRosterCsv", () => {
  it("parses valid rows and skips the header", () => {
    const csv = "name,email,section\nAarav Sharma,aarav@mastersunion.org,A\nDiya Mehta,diya@mastersunion.org,h\n";
    const result = parseRosterCsv(csv, SECTIONS);
    expect(result.invalid).toHaveLength(0);
    expect(result.rows).toEqual([
      { name: "Aarav Sharma", email: "aarav@mastersunion.org", section: "A" },
      { name: "Diya Mehta", email: "diya@mastersunion.org", section: "H" },
    ]);
  });

  it("handles quoted cells, blank lines, and lowercases emails", () => {
    const csv = '\n"Riya Nair","RIYA@Mastersunion.org","B"\n\n';
    const { rows, invalid } = parseRosterCsv(csv, SECTIONS);
    expect(invalid).toHaveLength(0);
    expect(rows).toEqual([{ name: "Riya Nair", email: "riya@mastersunion.org", section: "B" }]);
  });

  it("flags bad emails, unknown sections, wrong shapes, and duplicates", () => {
    const csv = [
      "name,email,section",
      "Bad Email,not-an-email,A", // invalid email
      "Bad Section,ok@x.org,Z", // unknown section
      "Too,Few", // wrong shape
      "Dup One,dup@x.org,A",
      "Dup Two,dup@x.org,B", // duplicate email in file
      ",empty@x.org,A", // empty name
    ].join("\n");
    const { rows, invalid } = parseRosterCsv(csv, SECTIONS);
    expect(rows).toEqual([{ name: "Dup One", email: "dup@x.org", section: "A" }]);
    expect(invalid).toHaveLength(5);
    expect(invalid.map((i) => i.reason)).toEqual([
      expect.stringContaining("invalid email"),
      expect.stringContaining("unknown section"),
      expect.stringContaining("3 columns"),
      expect.stringContaining("duplicate email"),
      expect.stringContaining("empty name"),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Live-DB import endpoint (self-skips when Postgres is unreachable)
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

describe.skipIf(!live)("roster import endpoint (live DB)", () => {
  const stamp = Date.now();
  const adminEmail = `import-admin-${stamp}@test.local`;
  let prisma: import("@prisma/client").PrismaClient;
  let adminId: string;
  let studentId: string;

  beforeAll(async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    // Section A must exist (the seed provides it; upsert keeps this file
    // self-sufficient if run against a fresh DB).
    await prisma.section.upsert({
      where: { code: "A" },
      update: {},
      create: { code: "A", name: "Section A" },
    });
    adminId = (
      await prisma.user.create({
        data: { email: adminEmail, name: "Import Admin", role: "admin" },
      })
    ).id;
    studentId = (
      await prisma.user.create({
        data: { email: `import-student-${stamp}@test.local`, name: "Import Student", role: "student" },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `${stamp}@test.local` } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: `${stamp}.roster.test` } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  function post(userId: string, csv: string) {
    return new Request("http://test.local/api/admin/roster/import", {
      method: "POST",
      body: csv,
      headers: {
        "content-type": "text/csv",
        cookie: `${TEST_LOGIN_COOKIE}=${userId}`,
      },
    });
  }

  it("creates valid rows, skips duplicates, reports invalid rows without creating them", async () => {
    const { POST } = await import("../app/api/admin/roster/import/route");
    const e1 = `one-${stamp}.roster.test`;
    const e2 = `two-${stamp}.roster.test`;
    const csv = [
      "name,email,section",
      `Imported One,i1@${e1},A`,
      `Imported Two,i2@${e2},A`,
      `Bad Row,not-an-email,A`,
      `Bad Section,i3@bad-${stamp}.roster.test,Q9`,
    ].join("\n");

    const res = await POST(post(adminId, csv));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(2);
    expect(json.skipped).toBe(0);
    expect(json.invalid).toBe(2);
    expect(
      await prisma.user.count({ where: { email: { endsWith: `${stamp}.roster.test` } } }),
    ).toBe(2);
    const created = await prisma.user.findUnique({ where: { email: `i1@${e1}` } });
    expect(created?.role).toBe("student");
    expect(created?.sectionId).toBeTruthy();

    // Re-import the same CSV: everything valid is now a duplicate.
    const res2 = await POST(post(adminId, csv));
    const json2 = await res2.json();
    expect(json2.created).toBe(0);
    expect(json2.skipped).toBe(2);
    expect(json2.invalid).toBe(2);
    expect(
      await prisma.user.count({ where: { email: { endsWith: `${stamp}.roster.test` } } }),
    ).toBe(2);
  });

  it("rejects empty bodies with 400 and non-admins with 403", async () => {
    const { POST } = await import("../app/api/admin/roster/import/route");
    expect((await POST(post(adminId, "   "))).status).toBe(400);
    expect((await POST(post(studentId, "name,email,section\nX,x@y.z,A"))).status).toBe(403);
  });
});
