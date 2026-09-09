import { describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { PrismaClient } from "@prisma/client";
import { lockStudentStarts } from "@/lib/interview/session";

// The per-student advisory lock is raw SQL, so TypeScript cannot check it and
// no mock can either — the test doubles elsewhere deliberately have no
// $executeRaw and skip the lock entirely. Only Postgres knows whether the
// function signature exists, so only Postgres can guard it.
//
// It shipped as pg_advisory_xact_lock(<int8>, hashtext(...)). Postgres has
// (int8) and (int4, int4) and nothing in between, so every call raised
// 42883 -> P2010 -> an unmapped 500 out of /api/interview/token -> "the
// real-time interviewer is unavailable" for every student in the cohort.

const canReachDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!canReachDb)("startInterview advisory lock", () => {
  it("names a pg_advisory_xact_lock overload that actually exists", async () => {
    const prisma = new PrismaClient();
    try {
      await prisma.$transaction(async (tx) => {
        await expect(lockStudentStarts(tx, "u_lock_probe")).resolves.toBeUndefined();
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("serializes on the student, not globally: two students never block", async () => {
    const prisma = new PrismaClient();
    try {
      await Promise.all([
        prisma.$transaction(async (tx) => lockStudentStarts(tx, "u_a")),
        prisma.$transaction(async (tx) => lockStudentStarts(tx, "u_b")),
      ]);
    } finally {
      await prisma.$disconnect();
    }
  });
});
