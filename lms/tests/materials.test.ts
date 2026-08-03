import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { parseCsvPreview } from "../lib/csv-preview";
import { __setS3TestOverrides } from "../lib/s3";
import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";

// U7 — materials: session-hub data assembly, gated download/preview routes,
// instructor upload-url + create. Live DB against the deterministic seed.

// ---------------------------------------------------------------------------
// Pure CSV preview parsing — no DB
// ---------------------------------------------------------------------------

describe("parseCsvPreview", () => {
  it("returns headers + rows and no truncation for a small file", () => {
    const out = parseCsvPreview("a,b,c\n1,2,3\n4,5,6\n");
    expect(out.headers).toEqual(["a", "b", "c"]);
    expect(out.rows).toEqual([["1", "2", "3"], ["4", "5", "6"]]);
    expect(out.truncated).toBe(false);
  });

  it("handles quoted fields containing commas and quotes", () => {
    const out = parseCsvPreview('name,note\n"Sharma, Aarav","said ""hi"""\n');
    expect(out.rows).toEqual([["Sharma, Aarav", 'said "hi"']]);
  });

  it("caps at 100 rows and sets truncated", () => {
    const lines = ["h1,h2", ...Array.from({ length: 150 }, (_, i) => `${i},x`)];
    const out = parseCsvPreview(lines.join("\n"));
    expect(out.rows.length).toBe(100);
    expect(out.truncated).toBe(true);
  });

  it("drops a partial trailing line (ranged read cuts mid-row) and marks truncated", () => {
    const out = parseCsvPreview("a,b\n1,2\n3,4"); // no trailing newline: last row may be cut
    expect(out.rows).toEqual([["1", "2"]]);
    expect(out.truncated).toBe(true);
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

const STUDENT = "user_s001"; // Section A
const INSTRUCTOR = "user_instructor";

function reqAs(userId: string, url = "http://test.local/x", init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie: `${TEST_LOGIN_COOKIE}=${userId}`,
    },
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!live)("materials (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    __setS3TestOverrides({
      configured: true,
      sign: (d) => `https://s3.test/${d.key}?sig=presigned`,
      read: () =>
        Promise.resolve(
          new TextEncoder().encode(
            ["col_a,col_b", ...Array.from({ length: 150 }, (_, i) => `${i},v${i}`)].join("\n") + "\n",
          ),
        ),
    });
  }, 120_000);

  afterAll(async () => {
    __setS3TestOverrides(null);
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });

  // --- data assembly ------------------------------------------------------

  it("getSessionsIndex: 10 cards; locked sessions carry title + lock only (no contents)", async () => {
    const { getSessionsIndex } = await import("../lib/materials");
    const index = await getSessionsIndex(STUDENT);
    expect(index.sessions.length).toBe(10);

    const s3 = index.sessions.find((s) => s.sessionNo === 3)!;
    expect(s3.locked).toBe(false);
    if (s3.locked) throw new Error("unreachable");
    expect(s3.summaryMd).toBeTruthy();
    expect(s3.counts.materials).toBeGreaterThan(0);

    const s4 = index.sessions.find((s) => s.sessionNo === 4)!;
    expect(s4.locked).toBe(true);
    // Title-only card: no summary/counts keys anywhere in the payload.
    expect(Object.keys(s4).sort()).toEqual(["id", "locked", "sessionNo", "title"]);
    expect(s4.title).toBeTruthy();
  });

  it("getSessionHub: open session lists gated materials; instructorOnly rows never appear", async () => {
    const { getSessionHub } = await import("../lib/materials");
    const hub = (await getSessionHub(STUDENT, 3))!;
    expect(hub).not.toBeNull();
    expect(hub.locked).toBe(false);
    if (hub.locked) throw new Error("unreachable");

    const ids = hub.materials.map((m) => m.id);
    expect(ids).toContain("mat_s3_moxie");
    expect(ids).toContain("mat_s3_schema_stocks"); // shown, but not available
    // instructorOnly rows never reach the student payload, even by id.
    expect(ids).not.toContain("mat_s3_moxie_fy");
    expect(ids).not.toContain("mat_s3_allstocks");
    expect(JSON.stringify(hub)).not.toContain("wall demo");

    expect(hub.materials.find((m) => m.id === "mat_s3_moxie")!.available).toBe(true);
    expect(hub.materials.find((m) => m.id === "mat_s3_schema_stocks")!.available).toBe(false);

    // Assignment + quiz slots
    expect(hub.assignments.map((a) => a.id)).toContain("asg_s3_datamemo");
    const quiz = hub.quizzes.find((q) => q.id === "quiz_s3")!;
    expect(quiz.armed).toBe(false); // seeded closed
  });

  it("getSessionHub: locked session payload contains title + lock and nothing else", async () => {
    const { getSessionHub } = await import("../lib/materials");
    const hub = await getSessionHub(STUDENT, 4);
    expect(hub).not.toBeNull();
    expect(hub!.locked).toBe(true);
    const json = JSON.stringify(hub);
    // No session-4 material titles may leak into the payload.
    expect(json).not.toContain("Vibe Coding");
    expect(json).not.toContain("Lovable Tutorial");
    expect(json).not.toContain("summaryMd");
  });

  // --- download route -----------------------------------------------------

  it("download: student + open material → 302 to a presigned URL", async () => {
    const { GET } = await import("../app/api/materials/[id]/download/route");
    const res = await GET(reqAs(STUDENT), params("mat_s3_moxie"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("https://s3.test/seed/session3/moxie_retail_oct2025.csv");
    expect(res.headers.get("location")).toContain("sig=presigned");
  });

  it("download: locked material in an open session → 404 for students", async () => {
    const { GET } = await import("../app/api/materials/[id]/download/route");
    const res = await GET(reqAs(STUDENT), params("mat_s3_schema_stocks"));
    expect(res.status).toBe(404);
  });

  it("download: instructorOnly → 404 for students, success path for instructors", async () => {
    const { GET } = await import("../app/api/materials/[id]/download/route");
    expect((await GET(reqAs(STUDENT), params("mat_s3_moxie_fy"))).status).toBe(404);
    const res = await GET(reqAs(INSTRUCTOR), params("mat_s3_moxie_fy"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("sig=presigned");
  });

  it("download: material with an open gate inside a LOCKED session stays unavailable (parent rule); a GateException overrides", async () => {
    const { setGateState, grantException } = await import("../lib/gates");
    // The seed wipe does not cover GateException — clear any prior run's grant.
    await prisma.gateException.deleteMany({ where: { targetId: "test_mat_s4_file" } });
    await prisma.material.create({
      data: {
        id: "test_mat_s4_file",
        sessionNo: 4,
        title: "Test S4 dataset",
        kind: "dataset",
        s3Key: "seed/session4/test.csv",
        sizeBytes: 100,
        sectionIds: ["sec_A", "sec_B", "sec_C", "sec_D", "sec_E", "sec_F", "sec_G", "sec_H"],
      },
    });
    await setGateState({
      targetType: "material",
      targetId: "test_mat_s4_file",
      sectionId: "sec_A",
      state: "open",
      actorId: INSTRUCTOR,
    });

    const { GET } = await import("../app/api/materials/[id]/download/route");
    // Own gate open, parent session 4 locked → unavailable.
    expect((await GET(reqAs(STUDENT), params("test_mat_s4_file"))).status).toBe(404);

    // Per-student exception overrides both gates.
    await grantException({
      targetType: "material",
      targetId: "test_mat_s4_file",
      sectionId: "sec_A",
      userId: STUDENT,
      grantedBy: INSTRUCTOR,
    });
    const res = await GET(reqAs(STUDENT), params("test_mat_s4_file"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("sig=presigned");
  });

  it("download: unauthenticated → 401; unknown id → 404", async () => {
    const { GET } = await import("../app/api/materials/[id]/download/route");
    expect((await GET(new Request("http://test.local/x"), params("mat_s3_moxie"))).status).toBe(401);
    expect((await GET(reqAs(STUDENT), params("mat_does_not_exist"))).status).toBe(404);
  });

  // --- preview route ------------------------------------------------------

  it("preview: csv returns at most 100 rows + truncated flag via a ranged read", async () => {
    const { GET } = await import("../app/api/materials/[id]/preview/route");
    const res = await GET(reqAs(STUDENT), params("mat_s3_moxie"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("csv");
    expect(body.headers).toEqual(["col_a", "col_b"]);
    expect(body.rows.length).toBe(100);
    expect(body.truncated).toBe(true);
  });

  it("preview: pdf returns a presigned inline URL; gate rules still apply", async () => {
    const { GET } = await import("../app/api/materials/[id]/preview/route");
    const res = await GET(reqAs(STUDENT), params("mat_s3_labsheet"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("pdf");
    expect(body.url).toContain("sig=presigned");

    // Locked material → 404 even for preview.
    expect((await GET(reqAs(STUDENT), params("mat_s3_schema_stocks"))).status).toBe(404);
  });

  // --- instructor upload-url + create ------------------------------------

  it("upload-url: students are 403; instructors get a presigned PUT with the exact material key", async () => {
    const { POST } = await import("../app/api/materials/upload-url/route");
    const body = JSON.stringify({
      sessionNo: 3,
      filename: "extra_deck.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(
      (await POST(reqAs(STUDENT, "http://test.local/x", { method: "POST", body }))).status,
    ).toBe(403);

    const res = await POST(reqAs(INSTRUCTOR, "http://test.local/x", { method: "POST", body }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.key).toBe("materials/session3/extra_deck.pdf");
    expect(json.url).toContain("sig=presigned");
  });

  it("create: instructor-only; created row carries the expected key/size and joins the session page", async () => {
    const { POST } = await import("../app/api/materials/route");
    const body = JSON.stringify({
      sessionNo: 3,
      title: "Extra deck",
      kind: "deck",
      s3Key: "materials/session3/extra_deck.pdf",
      sizeBytes: 1024,
    });
    expect(
      (await POST(reqAs(STUDENT, "http://test.local/x", { method: "POST", body }))).status,
    ).toBe(403);

    const res = await POST(reqAs(INSTRUCTOR, "http://test.local/x", { method: "POST", body }));
    expect(res.status).toBe(200);
    const { material } = await res.json();
    const row = await prisma.material.findUnique({ where: { id: material.id } });
    expect(row?.s3Key).toBe("materials/session3/extra_deck.pdf");
    expect(row?.sizeBytes).toBe(1024);
    expect(row?.sessionNo).toBe(3);
    const page = await prisma.sessionPage.findUnique({ where: { sessionNo: 3 } });
    expect(page?.orderedMaterialIds).toContain(material.id);
  });
});
