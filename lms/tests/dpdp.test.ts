import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { TEST_LOGIN_COOKIE } from "../lib/auth/test-login";
import { main as runSeed } from "../prisma/seed";
import {
  projectSafeAppealHistory,
  projectSafeEvidenceManifest,
  projectSafeScalarFields,
} from "../lib/safe-exports";

// U16/U7 — DPDP tools: the admin data-access bundle uses version-bound safe
// projections (plus explicit legacy compatibility), and the erasure endpoint
// remains FK-safe and idempotent.
//
// Seed facts used:
//   user_s001: submissions, quiz attempts incl. the diagnostic
//   "Surprise quiz · Data privacy (DPDP)", cp1 peer reviews given
//   AND received inside team_A1 (s001…s008).
//   user_s004: owns interview iv_001 (graded, with turns) — the delete target.

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

const ADMIN = "user_admin_pushpak";

const FORBIDDEN_EXPORT_TERMS = [
  "answerkey",
  "answer_key",
  "blueprint",
  "confidence",
  "credential",
  "evaluator",
  "grade",
  "prompt",
  "rawlog",
  "raw_log",
  "rubric",
  "runlog",
  "run_log",
  "s3key",
  "s3_key",
  "secret",
  "token",
  "trustmrr",
  "trust_mrr",
];

function deepForbiddenHits(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (typeof value === "string") {
    for (const term of FORBIDDEN_EXPORT_TERMS) {
      if (value.toLowerCase().includes(term)) hits.push(`${path} value contains ${term}`);
    }
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => hits.push(...deepForbiddenHits(entry, `${path}[${index}]`)));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      for (const term of FORBIDDEN_EXPORT_TERMS) {
        if (key.toLowerCase().includes(term)) hits.push(`${path}.${key} key contains ${term}`);
      }
      hits.push(...deepForbiddenHits(entry, `${path}.${key}`));
    }
  }
  return hits;
}

describe("safe DPDP projection", () => {
  it("declares and names the privacy-safe bundle as contract v2", async () => {
    const { DPDP_EXPORT_CONTRACT_VERSION, dpdpExportFilename } = await import(
      "../app/api/admin/dpdp/export/route"
    );

    expect(DPDP_EXPORT_CONTRACT_VERSION).toBe(2);
    expect(dpdpExportFilename("user_s001")).toBe("dpdp-export-v2-user_s001.json");
  });

  it("exports allowlisted scalar fields while dropping forbidden keys and sentinel values", () => {
    const fields = projectSafeScalarFields(
      {
        workflowTitle: "Qualified lead routing",
        limitations: "Retries stop after three attempts.",
        promptLog: "private evaluator prompt",
        rawRunLog: "raw workflow payload",
        trustMrrRow: "TrustMRR product_id=private-17",
        safeKeyWithSecretValue: "api_key=sk_live_FAKE_SECRET_VALUE_123456",
      },
      [
        "workflowTitle",
        "limitations",
        "promptLog",
        "rawRunLog",
        "trustMrrRow",
        "safeKeyWithSecretValue",
      ],
    );
    expect(fields).toEqual({
      workflowTitle: "Qualified lead routing",
      limitations: "Retries stop after three attempts.",
    });
    expect(deepForbiddenHits(fields)).toEqual([]);
  });

  it("projects only clean allowlisted evidence metadata without any object locator", () => {
    const evidence = projectSafeEvidenceManifest(
      [
        {
          role: "workflowPngFile",
          filename: "workflow.png",
          inspectedMimeType: "image/png",
          byteCount: 18_042,
          scanState: "clean",
          committedAt: new Date("2026-08-01T10:00:00.000Z"),
          s3Key: "submissions/private/workflow.png",
          s3VersionId: "secret-object-version",
          etag: "private-etag",
          sha256: "private-content-digest",
        },
        {
          role: "runLogFile",
          filename: "raw-log.json",
          inspectedMimeType: "application/json",
          byteCount: 500,
          scanState: "clean",
          committedAt: new Date("2026-08-01T10:01:00.000Z"),
          s3Key: "submissions/private/raw-log.json",
        },
        {
          role: "workflowPngFile",
          filename: "unsafe.png",
          inspectedMimeType: "image/png",
          byteCount: 100,
          scanState: "quarantined",
          committedAt: new Date("2026-08-01T10:02:00.000Z"),
          s3Key: "submissions/private/unsafe.png",
        },
      ],
      ["workflowPngFile", "runLogFile"],
    );
    expect(evidence).toEqual([
      {
        role: "workflowPngFile",
        filename: "workflow.png",
        mediaType: "image/png",
        bytes: 18_042,
        receivedAt: "2026-08-01T10:00:00.000Z",
      },
    ]);
    expect(deepForbiddenHits(evidence)).toEqual([]);
  });

  it("includes safe appeal reason/status/outcome/timestamps and redacts unsafe narrative", () => {
    const appeals = projectSafeAppealHistory([
      {
        reason: "The cited acceptance test was not visible in my submission.",
        status: "resolved",
        outcome: "Evidence rechecked; the original decision stands.",
        createdAt: new Date("2026-08-02T09:00:00.000Z"),
        updatedAt: new Date("2026-08-03T09:00:00.000Z"),
        resolvedAt: new Date("2026-08-03T09:00:00.000Z"),
      },
      {
        reason: "Please inspect promptLog containing sk_live_FAKE_SECRET_VALUE_123456",
        status: "open",
        outcome: null,
        createdAt: new Date("2026-08-04T09:00:00.000Z"),
        updatedAt: new Date("2026-08-04T09:00:00.000Z"),
        resolvedAt: null,
      },
    ]);
    expect(appeals[0]).toEqual({
      reason: "The cited acceptance test was not visible in my submission.",
      status: "resolved",
      outcome: "Evidence rechecked; the original decision stands.",
      createdAt: "2026-08-02T09:00:00.000Z",
      updatedAt: "2026-08-03T09:00:00.000Z",
      resolvedAt: "2026-08-03T09:00:00.000Z",
    });
    expect(appeals[1].reason).toBe("[redacted]");
    expect(deepForbiddenHits(appeals)).toEqual([]);
  });
});

describe.skipIf(!live)("U16 DPDP export + delete (live DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma?.$disconnect();
  });

  function exportFor(actor: string | null, userId: string | null) {
    const qs = userId ? `?userId=${userId}` : "";
    return import("../app/api/admin/dpdp/export/route").then(({ GET }) =>
      GET(
        new Request(`http://localhost/api/admin/dpdp/export${qs}`, {
          headers: actor ? { cookie: `${TEST_LOGIN_COOKIE}=${actor}` } : {},
        }),
      ),
    );
  }

  function deleteFor(actor: string | null, body: unknown) {
    return import("../app/api/admin/dpdp/delete/route").then(({ POST }) =>
      POST(
        new Request("http://localhost/api/admin/dpdp/delete", {
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

  // --- export --------------------------------------------------------------

  it("export is admin-only (instructor 403) and 404s on unknown users", async () => {
    expect((await exportFor(null, "user_s001")).status).toBe(401);
    expect((await exportFor("user_instructor", "user_s001")).status).toBe(403);
    expect((await exportFor(ADMIN, "user_nope")).status).toBe(404);
    expect((await exportFor(ADMIN, null)).status).toBe(400);
  });

  it("exports safe student rows and never serializes evaluator, grading, private-data, workflow-log, or object-key material", async () => {
    const res = await exportFor(ADMIN, "user_s001");
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as Record<string, unknown> & {
      contractVersion: number;
      user: { id: string; email: string };
      submissions: { id: string; fields: Record<string, unknown>; appeals: unknown[] }[];
      learningActivities: { title: string; submittedAt: string }[];
      peerReviewsGiven: { checkpoint: number; revieweeId: string }[];
    };

    expect(bundle.contractVersion).toBe(2);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="dpdp-export-v2-user_s001.json"',
    );
    expect(bundle.user.id).toBe("user_s001");
    expect(bundle.user.email).toBe("student001@mastersunion.org");

    const dbSubs = await prisma.submission.count({ where: { userId: "user_s001" } });
    expect(bundle.submissions).toHaveLength(dbSubs);
    expect(dbSubs).toBeGreaterThan(0);
    expect(deepForbiddenHits(bundle)).toEqual([]);
    expect("s3Keys" in bundle).toBe(false);
    expect(bundle.submissions.every((submission) => !("grades" in submission))).toBe(true);
  });

  it("discloses teammate-owned actor attribution globally without exposing private row data", async () => {
    const actor = await prisma.user.findUniqueOrThrow({
      where: { id: "user_s001" },
      select: { id: true, teamId: true },
    });
    const teammate = await prisma.user.findFirstOrThrow({
      where: { teamId: actor.teamId!, id: { not: actor.id } },
      select: { id: true },
    });
    const assignment = await prisma.assignment.findFirstOrThrow({
      where: { contractMode: "legacy" },
      select: { id: true },
    });
    const finalSubmissionId = "dpdp-export-attribution-shared-final";
    const draftSubmissionId = "dpdp-export-attribution-shared-draft";
    await prisma.submission.createMany({
      data: [
        {
          id: finalSubmissionId,
          assignmentId: assignment.id,
          userId: teammate.id,
          teamId: actor.teamId,
          status: "draft",
          fields: { title: "Shared attribution fixture" },
          files: [],
          ownerKind: "team",
          ownerId: actor.teamId,
          contentHash: "dpdp-export-attribution-final",
        },
        {
          id: draftSubmissionId,
          assignmentId: assignment.id,
          userId: teammate.id,
          teamId: actor.teamId,
          status: "draft",
          fields: { title: "Shared upload fixture" },
          files: [],
          ownerKind: "team",
          ownerId: actor.teamId,
          contentHash: "dpdp-export-attribution-draft",
        },
      ],
    });
    await prisma.submission.update({
      where: { id: finalSubmissionId },
      data: { status: "submitted", submittedAt: new Date() },
    });
    await prisma.submission.update({
      where: { id: finalSubmissionId },
      data: { status: "finalised" },
    });
    const sharedGrade = await prisma.grade.create({
      data: {
        id: "dpdp-export-attribution-result",
        submissionId: finalSubmissionId,
        rubricScores: {},
        total: 1,
        confidence: 1,
        feedbackMd: "Not exported",
        flags: [],
        gradedBy: "fixture",
      },
    });
    const sharedHold = await prisma.gradeHold.create({
      data: {
        id: "dpdp-export-attribution-hold",
        submissionId: finalSubmissionId,
        gradeId: sharedGrade.id,
        kind: "appeal",
        code: "export-attribution",
        reason: "Private hold reason",
        createdBy: actor.id,
      },
    });
    const sharedAppeal = await prisma.gradeAppeal.create({
      data: {
        id: "dpdp-export-attribution-appeal",
        gradeId: sharedGrade.id,
        openedBy: actor.id,
        reason: "Private appeal reason",
        holdId: sharedHold.id,
      },
    });
    const sharedPublication = await prisma.publicationDecision.create({
      data: {
        id: "dpdp-export-attribution-consent",
        submissionId: finalSubmissionId,
        ownerConsent: true,
        ownerConsentBy: actor.id,
        ownerConsentAt: new Date(),
      },
    });
    const sharedNomination = await prisma.teamWorkflowNomination.create({
      data: {
        id: "dpdp-export-attribution-nomination",
        teamId: actor.teamId!,
        assignmentId: assignment.id,
        submissionId: finalSubmissionId,
        nominatedBy: actor.id,
        reason: "Private nomination reason",
      },
    });
    const sharedUpload = await prisma.uploadReservation.create({
      data: {
        id: "dpdp-export-attribution-upload",
        submissionId: draftSubmissionId,
        assignmentId: assignment.id,
        ownerKind: "team",
        ownerId: actor.teamId!,
        createdById: actor.id,
        fieldKey: "artifact",
        fileRole: "artifactFile",
        filename: "private.json",
        s3Key: "submissions/private/dpdp-export-attribution.json",
        declaredContentType: "application/json",
        declaredBytes: 16,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const sharedAudit = await prisma.auditLog.create({
      data: {
        id: "dpdp-export-attribution-audit",
        actorId: actor.id,
        action: "fixture.private-action",
        targetType: "user",
        targetId: actor.id,
        after: { secret: "sk_live_FAKE_SECRET_VALUE_123456" },
      },
    });

    const response = await exportFor(ADMIN, actor.id);
    expect(response.status).toBe(200);
    const raw = await response.text();
    const bundle = JSON.parse(raw) as {
      actorAttributions: Array<{
        recordType: string;
        recordId: string;
        role: string;
        erasureDisposition: string;
      }>;
    };
    expect(bundle.actorAttributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recordType: "upload", recordId: sharedUpload.id }),
        expect.objectContaining({ recordType: "appeal", recordId: sharedAppeal.id }),
        expect.objectContaining({ recordType: "hold", recordId: sharedHold.id }),
        expect.objectContaining({
          recordType: "publication-consent",
          recordId: sharedPublication.id,
        }),
        expect.objectContaining({
          recordType: "team-nomination",
          recordId: sharedNomination.id,
        }),
        expect.objectContaining({
          recordType: "audit",
          recordId: sharedAudit.id,
          role: "actorId",
        }),
        expect.objectContaining({
          recordType: "audit",
          recordId: sharedAudit.id,
          role: "targetId",
        }),
      ]),
    );
    expect(
      bundle.actorAttributions.every(
        (row) => row.erasureDisposition === "pseudonymized-on-erasure",
      ),
    ).toBe(true);
    expect(deepForbiddenHits(bundle.actorAttributions)).toEqual([]);
    expect(raw).not.toContain("submissions/private/dpdp-export-attribution.json");
    expect(raw).not.toContain("sk_live_FAKE_SECRET_VALUE_123456");
    expect(raw).not.toContain("Private appeal reason");
  });

  it("contains peer reviews GIVEN, never RECEIVED", async () => {
    const res = await exportFor(ADMIN, "user_s001");
    const bundle = (await res.json()) as {
      peerReviewsGiven: { revieweeId: string; pointsAllocated: number }[];
    } & Record<string, unknown>;

    const given = await prisma.peerReview.count({ where: { reviewerId: "user_s001" } });
    const received = await prisma.peerReview.count({ where: { revieweeId: "user_s001" } });
    expect(given).toBeGreaterThan(0);
    expect(received).toBeGreaterThan(0);
    expect(bundle.peerReviewsGiven).toHaveLength(given);
    expect(bundle.peerReviewsGiven.every((r) => r.revieweeId !== "user_s001")).toBe(true);
    expect("peerReviewsReceived" in bundle).toBe(false);
    expect(JSON.stringify(bundle)).not.toContain("revieweeId\":\"user_s001");
  });

  it("includes quiz participation as a plain learning activity without answers or result values", async () => {
    const res = await exportFor(ADMIN, "user_s001");
    const raw = await res.text();
    const bundle = JSON.parse(raw) as { learningActivities: { title: string }[] };

    const dbAttempts = await prisma.quizAttempt.count({ where: { userId: "user_s001" } });
    expect(bundle.learningActivities).toHaveLength(dbAttempts);
    expect(bundle.learningActivities.some((a) => a.title.includes("DPDP"))).toBe(true);

    expect(raw).not.toContain("isDiagnostic");
    expect(raw.toLowerCase()).not.toContain("diagnostic");
    expect(raw).not.toContain("scorePct");
    expect(raw).not.toContain("answers");
  });

  it("carries no other student's email or name anywhere in the bundle", async () => {
    const res = await exportFor(ADMIN, "user_s001");
    const raw = await res.text();

    const emails = raw.match(/student\d{3}@mastersunion\.org/g) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    expect(new Set(emails)).toEqual(new Set(["student001@mastersunion.org"]));

    // Teammates (whose reviews of s001 exist in the DB) never appear by name.
    const me = await prisma.user.findUniqueOrThrow({ where: { id: "user_s001" } });
    const teammates = await prisma.user.findMany({
      where: { teamId: me.teamId!, id: { not: "user_s001" } },
      select: { name: true },
    });
    for (const t of teammates) {
      if (t.name !== me.name) expect(raw).not.toContain(t.name);
    }
  });

  // --- delete --------------------------------------------------------------

  it("delete is admin-only and requires the matching confirmEmail", async () => {
    expect(
      (
        await deleteFor("user_instructor", {
          userId: "user_s004",
          confirmEmail: "student004@mastersunion.org",
        })
      ).status,
    ).toBe(403);

    const mismatch = await deleteFor(ADMIN, {
      userId: "user_s004",
      confirmEmail: "wrong@mastersunion.org",
    });
    expect(mismatch.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: "user_s004" } })).not.toBeNull();
  });

  it("fails closed before creating an intent when legacy object keys lack a VersionId", async () => {
    const legacyAssignment = await prisma.assignment.findFirstOrThrow({
      where: { contractMode: "legacy" },
      select: { id: true },
    });
    await prisma.submission.create({
      data: {
        id: "dpdp-s004-legacy-object-without-version",
        assignmentId: legacyAssignment.id,
        userId: "user_s004",
        status: "draft",
        fields: {},
        files: ["legacy/dpdp-s004/object-without-version.bin"],
      },
    });
    const before = {
      interviews: await prisma.interview.count({ where: { userId: "user_s004" } }),
      interviewTurns: await prisma.interviewTurn.count({
        where: { interview: { userId: "user_s004" } },
      }),
      quizAttempts: await prisma.quizAttempt.count({ where: { userId: "user_s004" } }),
      peerReviews: await prisma.peerReview.count({
        where: { OR: [{ reviewerId: "user_s004" }, { revieweeId: "user_s004" }] },
      }),
    };
    expect(before.interviews).toBeGreaterThan(0);
    expect(before.interviewTurns).toBeGreaterThan(0);
    expect(before.quizAttempts).toBeGreaterThan(0);
    expect(before.peerReviews).toBeGreaterThan(0);

    const res = await deleteFor(ADMIN, {
      userId: "user_s004",
      confirmEmail: "student004@mastersunion.org",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "object-version-missing" });

    // No S3 work or database cleanup can begin without an exact object version.
    expect(await prisma.user.findUnique({ where: { id: "user_s004" } })).not.toBeNull();
    expect(await prisma.interview.count({ where: { userId: "user_s004" } })).toBe(
      before.interviews,
    );
    expect(
      await prisma.interviewTurn.count({ where: { interview: { userId: "user_s004" } } }),
    ).toBe(before.interviewTurns);
    expect(await prisma.quizAttempt.count({ where: { userId: "user_s004" } })).toBe(
      before.quizAttempts,
    );
    expect(
      await prisma.peerReview.count({
        where: { OR: [{ reviewerId: "user_s004" }, { revieweeId: "user_s004" }] },
      }),
    ).toBe(before.peerReviews);
    expect(
      await prisma.deletionReceipt.count({
        where: { targetType: "dpdp-user", targetId: "user_s004" },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "dpdp-delete", targetId: "user_s004" },
      }),
    ).toBeNull();
  });

  it("erasing a team member preserves the team's shared submission (reassigned) and its grade (#5)", async () => {
    // Seed fact: sub_033 is team_A2's workflow artifact, authored by the member
    // who clicked submit (user_s009), graded (grade_sub_033). team_A2 members
    // are user_s009..user_s016.
    const before = await prisma.submission.findUnique({ where: { id: "sub_033" } });
    expect(before?.userId).toBe("user_s009");
    expect(before?.teamId).toBe("team_A2");
    expect(await prisma.grade.findUnique({ where: { id: "grade_sub_033" } })).not.toBeNull();

    // A surviving teammate's grade line (their §1/§2/§3 all read this team
    // artifact) must remain intact after the erasure.
    const teammate = "user_s010";
    expect(await prisma.user.findUnique({ where: { id: teammate } })).not.toBeNull();

    const res = await deleteFor(ADMIN, {
      userId: "user_s009",
      confirmEmail: "student009@mastersunion.org",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      alreadyCompleted: boolean;
      receiptId: string;
      deleted: { reassignedTeamSubmissions: number };
    };
    expect(body.alreadyCompleted).toBe(false);
    expect(body.deleted.reassignedTeamSubmissions).toBeGreaterThanOrEqual(1);

    // The erased person is gone…
    expect(await prisma.user.findUnique({ where: { id: "user_s009" } })).toBeNull();

    // …but the jointly-produced team artifact survives, reassigned to a
    // surviving team_A2 member, with its grade line untouched.
    const after = await prisma.submission.findUnique({ where: { id: "sub_033" } });
    expect(after).not.toBeNull();
    const { userId: beforeOwnerId, updatedAt: beforeUpdatedAt, ...beforeInvariant } = before!;
    const { userId: afterOwnerId, updatedAt: afterUpdatedAt, ...afterInvariant } = after!;
    expect(beforeOwnerId).toBe("user_s009");
    expect(afterOwnerId).not.toBe(beforeOwnerId);
    expect(afterUpdatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdatedAt.getTime());
    expect(afterInvariant).toEqual(beforeInvariant);
    expect(after!.teamId).toBe("team_A2");
    const survivors = await prisma.user.findMany({
      where: { teamId: "team_A2" },
      select: { id: true },
    });
    expect(survivors.map((s) => s.id)).toContain(afterOwnerId);
    expect(await prisma.grade.findUnique({ where: { id: "grade_sub_033" } })).not.toBeNull();

    // The teammate is untouched by the erasure.
    expect(await prisma.user.findUnique({ where: { id: teammate } })).not.toBeNull();

    // A retry is a successful no-op tied to the original durable receipt.
    const again = await deleteFor(ADMIN, {
      userId: "user_s009",
      confirmEmail: "student009@mastersunion.org",
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({
      alreadyCompleted: true,
      receiptId: body.receiptId,
    });
  });
});
