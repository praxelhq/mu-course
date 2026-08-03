import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { main as runSeed } from "../prisma/seed";
import { cosineSimilarity } from "../lib/ai/embeddings";
import { findNearDuplicates } from "../lib/ai/near-dup";

// U9 — near-duplicate detection: exact contentHash match across students on
// the same assignment, plus cosine similarity over stored Gemini embeddings.
// Hash-only when no GEMINI_API_KEY (never throws).

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

const ASG = "asg_s2_skill";

function skillFields(writeup: string) {
  return { skillLink: "https://skills.example.com/nd", writeup };
}

describe("cosineSimilarity (pure)", () => {
  it("is 1 for identical vectors, 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 for mismatched/empty vectors", () => {
    expect(cosineSimilarity([], [1])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });
});

describe.skipIf(!live)("findNearDuplicates (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });

  async function mkSub(
    id: string,
    userId: string,
    contentHash: string,
    opts: { version?: number; embedding?: number[]; writeup?: string; assignmentId?: string } = {},
  ) {
    return prisma.submission.create({
      data: {
        id,
        assignmentId: opts.assignmentId ?? ASG,
        userId,
        status: "submitted",
        submittedAt: new Date(),
        fields: skillFields(opts.writeup ?? `writeup for ${id}`),
        files: [],
        version: opts.version ?? 1,
        contentHash,
        embedding: opts.embedding ?? [],
      },
    });
  }

  it("identical contentHash from different students on the same assignment → flagged", async () => {
    await mkSub("nd_a1", "user_s020", "ndhash_same");
    const b = await mkSub("nd_b1", "user_s021", "ndhash_same");
    const res = await findNearDuplicates(b, { embed: null });
    expect(res.nearDup).toBe(true);
    expect(res.reasons.join(" ")).toMatch(/hash/i);
  });

  it("same student resubmission (v2) NOT flagged against own v1", async () => {
    await mkSub("nd_own_v1", "user_s022", "ndhash_own");
    const v2 = await mkSub("nd_own_v2", "user_s022", "ndhash_own", { version: 2 });
    const res = await findNearDuplicates(v2, { embed: null });
    expect(res.nearDup).toBe(false);
  });

  it("embedding path: cosine 0.95 vs another student's stored embedding → flagged", async () => {
    // Other student's stored embedding is the unit x-axis.
    await mkSub("nd_emb_other", "user_s023", "ndhash_e1", { embedding: [1, 0] });
    const mine = await mkSub("nd_emb_mine", "user_s024", "ndhash_e2");
    const y = Math.sqrt(1 - 0.95 * 0.95);
    const res = await findNearDuplicates(mine, { embed: async () => [0.95, y] });
    expect(res.nearDup).toBe(true);
    expect(res.reasons.join(" ")).toMatch(/embedding|similar/i);
    // The computed embedding is persisted on the submission row.
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: "nd_emb_mine" } });
    expect(row.embedding.length).toBe(2);
  });

  it("embedding path: cosine 0.8 does NOT flag", async () => {
    // Separate assignment so the previous test's stored embeddings don't apply.
    const otherAsg = "asg_s3_datamemo";
    await mkSub("nd_emb_other2", "user_s025", "ndhash_e3", {
      embedding: [1, 0],
      assignmentId: otherAsg,
    });
    const mine = await mkSub("nd_emb_mine2", "user_s026", "ndhash_e4", {
      assignmentId: otherAsg,
    });
    const res = await findNearDuplicates(mine, { embed: async () => [0.8, 0.6] });
    expect(res.nearDup).toBe(false);
  });

  it("no GEMINI_API_KEY → hash-only, no throw", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const mine = await mkSub("nd_nokey", "user_s027", "ndhash_nokey");
    await expect(findNearDuplicates(mine)).resolves.toMatchObject({ nearDup: false });
    vi.unstubAllEnvs();
  });
});
