import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";
import { appendValidation } from "../lib/portfolio";
import {
  projectSafeScalarFields,
  resolveSafeExportContract,
  selectPraxyCandidate,
  type PraxyCandidate,
} from "../lib/safe-exports";

// U16/U7 — the Praxy export preview. Private assessment/evidence material,
// lifecycle state and scores never leave the LMS; artifacts are version-policy
// projections and badges are derived from human-verifiable records only.
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

const FORBIDDEN = [
  "answerkey",
  "answer_key",
  "blueprint",
  "confidence",
  "credential",
  "evaluator",
  "grade",
  "pci",
  "prompt",
  "rawlog",
  "raw_log",
  "rubric",
  "runlog",
  "run_log",
  "s3key",
  "s3_key",
  "score",
  "secret",
  "status",
  "token",
  "trustmrr",
  "trust_mrr",
];

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

function versionedCandidate(
  id: string,
  version: number,
  patch: Partial<PraxyCandidate> = {},
): PraxyCandidate {
  return {
    id,
    version,
    attempt: 1,
    contractMode: "versioned",
    exportPolicy: {
      praxy: { enabled: true, fieldKeys: ["productName", "publishedUrl"] },
      dpdp: { fieldKeys: ["productName"], evidenceRoles: [] },
    },
    submissionSchema: { fields: [] },
    legacyPraxyEnabled: false,
    lifecycle: "finalised",
    publishable: true,
    ownerConsent: true,
    ownerRevokedAt: null,
    instructorState: "approved",
    reviewCurrent: true,
    datasetBound: false,
    ...patch,
  };
}

describe("safe Praxy projection policy", () => {
  it("declares the fields-based response as contract v2", async () => {
    const { PRAXY_EXPORT_CONTRACT_VERSION } = await import(
      "../app/api/praxy/export/route"
    );

    expect(PRAXY_EXPORT_CONTRACT_VERSION).toBe(2);
  });

  it("uses strict version exportPolicy and an explicit conservative legacy fallback", () => {
    expect(
      resolveSafeExportContract({
        contractMode: "versioned",
        exportPolicy: {
          praxy: { enabled: true, fieldKeys: ["productName", "publishedUrl"] },
          dpdp: { fieldKeys: ["productName"], evidenceRoles: [] },
        },
        submissionSchema: { fields: [] },
        legacyPraxyEnabled: false,
      }),
    ).toMatchObject({
      mode: "versioned",
      praxy: { enabled: true, fieldKeys: ["productName", "publishedUrl"] },
    });
    expect(
      resolveSafeExportContract({
        contractMode: "versioned",
        exportPolicy: {
          praxy: { enabled: true, fieldKeys: ["promptLog"] },
          dpdp: { fieldKeys: [], evidenceRoles: [] },
        },
        submissionSchema: { fields: [] },
        legacyPraxyEnabled: false,
      }),
    ).toBeNull();
    expect(
      resolveSafeExportContract({
        contractMode: "legacy",
        exportPolicy: null,
        legacyPraxyEnabled: true,
        submissionSchema: {
          fields: [
            { key: "appUrl", label: "App", kind: "link", required: true },
            { key: "writeup", label: "Write-up", kind: "writeup", required: true },
            { key: "blueprintFile", label: "Blueprint", kind: "file", required: true },
          ],
        },
      }),
    ).toMatchObject({
      mode: "legacy",
      praxy: { enabled: true, fieldKeys: ["appUrl", "writeup"] },
      dpdp: { fieldKeys: ["appUrl", "writeup"], evidenceRoles: [] },
    });
  });

  it("removes the whole versioned chain on owner revocation but keeps V1 during an unready V2", () => {
    expect(
      selectPraxyCandidate([
        versionedCandidate("v1", 1),
        versionedCandidate("v2", 2, {
          ownerConsent: false,
          ownerRevokedAt: new Date("2026-08-12T00:00:00.000Z"),
        }),
      ]),
    ).toBeNull();
    expect(
      selectPraxyCandidate([
        versionedCandidate("v1", 1),
        versionedCandidate("v2", 2, {
          ownerConsent: false,
          instructorState: "pending",
          publishable: false,
        }),
      ])?.id,
    ).toBe("v1");
    expect(
      selectPraxyCandidate([
        versionedCandidate("v1", 1),
        versionedCandidate("v2", 2, { instructorState: "revoked" }),
      ]),
    ).toBeNull();
    expect(
      selectPraxyCandidate([
        versionedCandidate("v1", 1),
        versionedCandidate("v2", 2, { reviewCurrent: false }),
      ])?.id,
    ).toBe("v1");
    expect(
      selectPraxyCandidate([
        versionedCandidate("dataset-v1", 1, { datasetBound: true }),
      ]),
    ).toBeNull();
  });

  it("projects only policy-allowlisted scalar values and drops sentinel secrets/private data", () => {
    const projected = projectSafeScalarFields(
      {
        productName: "SignalShelf",
        publishedUrl: "https://signalshelf.lovable.app/",
        safeLookingButSecret: "authorization=sk_live_FAKE_SECRET_VALUE_123456",
        trustMrrNote: "TrustMRR row product_id=private-17",
        product_id: "private-17",
        revenue_30d_usd: 30_800,
        promptLog: "hidden evaluator prompt",
        grade: 40,
        rawLog: "raw workflow log",
      },
      [
        "productName",
        "publishedUrl",
        "safeLookingButSecret",
        "trustMrrNote",
        "product_id",
        "revenue_30d_usd",
        "promptLog",
        "grade",
        "rawLog",
      ],
    );
    expect(projected).toEqual({
      productName: "SignalShelf",
      publishedUrl: "https://signalshelf.lovable.app/",
    });
    expect(deepScan(projected)).toEqual([]);
  });
});

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

  it("NEVER carries private evaluator/data/workflow evidence, grades, prompts, status, or bare object keys", async () => {
    for (const userId of ["user_s001", "user_s004", "user_s011", signedOffMember]) {
      const res = await post("user_instructor", { userId });
      expect(res.status).toBe(200);
      const payload = (await res.json()) as Record<string, unknown>;
      expect(payload.contractVersion).toBe(2);
      expect(Object.keys(payload).sort()).toEqual([
        "artifacts",
        "badges",
        "contractVersion",
        "generatedAt",
        "student",
      ]);
      expect(deepScan(payload)).toEqual([]);
    }
  });

  it("artifacts come only from graded/finalised submissions", async () => {
    // user_s011's app submission is graded → the app artifact exports.
    const graded = (await (await post("user_instructor", { userId: "user_s011" })).json()) as {
      artifacts: { type: string; fields: Record<string, unknown>; featured: boolean }[];
    };
    const app = graded.artifacts.find((a) => a.type === "app");
    expect(app).toBeTruthy();
    expect(Object.values(app!.fields).some((v) => String(v).includes("lovable.app"))).toBe(true);

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

  it("badges: human-verified company sign-off, completed interview, and external validation", async () => {
    // Signed-off team member: staff-recorded sign-off with supporting evidence.
    await appendValidation(signedOffMember, {
      kind: "external",
      by: "instructor@praxel.in",
      note: "Company contact validated the workflow.",
      at: new Date().toISOString(),
    });
    const member = (await (await post("user_instructor", { userId: signedOffMember })).json()) as {
      badges: ({ kind: string } & Record<string, unknown>)[];
    };
    expect(member.badges).toContainEqual({ kind: "company-sign-off", verified: true });
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

  it("does not emit a company sign-off badge when the recorder is not a staff user", async () => {
    const row = await prisma.signOff.findUniqueOrThrow({ where: { teamId: "team_A2" } });
    await prisma.signOff.update({
      where: { teamId: "team_A2" },
      data: { recordedBy: signedOffMember },
    });
    try {
      const payload = (await (
        await post("user_instructor", { userId: signedOffMember })
      ).json()) as { badges: { kind: string }[] };
      expect(payload.badges.some((badge) => badge.kind === "company-sign-off")).toBe(false);
    } finally {
      await prisma.signOff.update({
        where: { teamId: "team_A2" },
        data: { recordedBy: row.recordedBy },
      });
    }
  });
});
