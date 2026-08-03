import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";
import { appendValidation } from "../lib/portfolio";

// U16 — the Praxy export stub. Grades and PCI never leave the LMS: the
// payload carries artifacts + badges ONLY, and a deep scan of every key and
// string value proves no score-shaped data slips through.
//
// Seed facts used:
//   team_A2 is signed_off WITH evidence (so_team_A2, evidenceS3Key set) and
//   its first member submitted the graded team workflow.
//   user_s004 has a graded interview (iv_001); user_s101 an escalated one.
//   Apps: user_s011 graded; user_s251 only 'submitted' (must not export).

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

const FORBIDDEN = ["total", "confidence", "rubricscores", "scorepct", "pci", "grade"];

/** Deep scan: no key and no string value may contain a forbidden term. */
function deepScan(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (typeof value === "string") {
    for (const term of FORBIDDEN) {
      if (value.toLowerCase().includes(term)) hits.push(`${path} value contains "${term}"`);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...deepScan(v, `${path}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      for (const term of FORBIDDEN) {
        if (k.toLowerCase().includes(term)) hits.push(`${path}.${k} key contains "${term}"`);
      }
      hits.push(...deepScan(v, `${path}.${k}`));
    }
  }
  return hits;
}

describe.skipIf(!live)("U16 Praxy export stub (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let signedOffMember: string;

  beforeAll(async () => {
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    const member = await prisma.user.findFirstOrThrow({
      where: { teamId: "team_A2", submissions: { some: { status: { in: ["graded", "finalised"] } } } },
      orderBy: { id: "asc" },
    });
    signedOffMember = member.id;
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma?.$disconnect();
  });

  function post(actor: string | null, body: unknown) {
    return import("../app/api/praxy/export/route").then(({ POST }) =>
      POST(
        new Request("http://localhost/api/praxy/export", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(actor ? { cookie: `${TEST_LOGIN_COOKIE}=${actor}` } : {}),
          },
          body: JSON.stringify(body),
        }),
      ),
    );
  }

  it("students cannot call it (403); unknown users 404", async () => {
    expect((await post(null, { userId: "user_s001" })).status).toBe(401);
    expect((await post("user_s001", { userId: "user_s001" })).status).toBe(403);
    expect((await post("user_instructor", { userId: "user_nope" })).status).toBe(404);
  });

  it("NEVER carries grades/scores/PCI/quiz data — deep forbidden-term scan of keys and values", async () => {
    for (const userId of ["user_s001", "user_s004", "user_s011", signedOffMember]) {
      const res = await post("user_instructor", { userId });
      expect(res.status).toBe(200);
      const payload = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(["artifacts", "badges", "generatedAt", "student"]);
      expect(deepScan(payload)).toEqual([]);
    }
  });

  it("artifacts come only from graded/finalised submissions", async () => {
    // user_s011's app submission is graded → the app artifact exports.
    const graded = (await (await post("user_instructor", { userId: "user_s011" })).json()) as {
      artifacts: { type: string; links: string[]; featured: boolean }[];
    };
    const app = graded.artifacts.find((a) => a.type === "app");
    expect(app).toBeTruthy();
    expect(app!.links.some((l) => l.includes("lovable.app"))).toBe(true);

    // user_s251's app submission is merely 'submitted' → no app artifact.
    const sub251 = await prisma.submission.findFirst({
      where: { userId: "user_s251", assignment: { assignmentType: { slug: "app" } } },
    });
    expect(sub251?.status).toBe("submitted");
    const ungraded = (await (await post("user_instructor", { userId: "user_s251" })).json()) as {
      artifacts: { type: string }[];
    };
    expect(ungraded.artifacts.find((a) => a.type === "app")).toBeUndefined();
  });

  it("badges: company-sign-off (with evidence), interview-completed only when graded, external-validation count", async () => {
    // Signed-off team member: sign-off badge with evidence:true.
    await appendValidation(signedOffMember, {
      kind: "external",
      by: "instructor@praxel.in",
      note: "Company contact validated the workflow.",
      at: new Date().toISOString(),
    });
    const member = (await (await post("user_instructor", { userId: signedOffMember })).json()) as {
      badges: ({ kind: string } & Record<string, unknown>)[];
    };
    expect(member.badges).toContainEqual({ kind: "company-sign-off", evidence: true });
    expect(member.badges).toContainEqual({ kind: "external-validation", count: 1 });

    // Graded interview → badge; escalated (unresolved) → no badge.
    const s004 = (await (await post("user_instructor", { userId: "user_s004" })).json()) as {
      badges: { kind: string }[];
    };
    expect(s004.badges.some((b) => b.kind === "interview-completed")).toBe(true);

    const s101 = (await (await post("user_instructor", { userId: "user_s101" })).json()) as {
      badges: { kind: string }[];
    };
    expect(s101.badges.some((b) => b.kind === "interview-completed")).toBe(false);
  });
});
