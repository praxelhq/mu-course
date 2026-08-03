import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import { main as runSeed } from "../prisma/seed";

// U8 — schema-driven submissions core (lib/submissions) + the extensibility
// proof: a brand-new AssignmentType row (created through the same code path
// the admin editor uses) accepts a valid submission with zero code changes.

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

const INSTRUCTOR = "user_instructor";
const ADMIN = "user_admin_pushpak";

const DATA_MEMO_FIELDS = {
  number1: "₹41,20,650 clean October revenue",
  move1: "Recompute one number",
  number2: "34,897 rows",
  move2: "Reconcile the base",
  number3: "NVDA best 5-year performer",
  move3: "Ask for the working",
  aiGotWrong: "It picked units over revenue without telling me.",
};

describe.skipIf(!live)("lib/submissions (live DB, seeded)", () => {
  let prisma: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    vi.stubEnv("ENABLE_TEST_LOGIN", "1");
    await runSeed();
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    // The seed wipe does not cover GateException — clear prior runs' grants.
    await prisma.gateException.deleteMany();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    vi.unstubAllEnvs();
  });

  it("happy path: fields validate, v1 row created submitted with a sha256 contentHash", async () => {
    const { submitAssignment } = await import("../lib/submissions");
    const sub = await submitAssignment({
      userId: "user_s002",
      assignmentId: "asg_s3_datamemo",
      fields: DATA_MEMO_FIELDS,
      files: [],
    });
    expect(sub.version).toBe(1);
    expect(sub.status).toBe("submitted");
    expect(sub.submittedAt).toBeInstanceOf(Date);
    expect(sub.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const row = await prisma.submission.findUnique({ where: { id: sub.id } });
    expect(row?.status).toBe("submitted");
  });

  it("resubmission bumps to v2 and leaves v1 untouched", async () => {
    const { submitAssignment } = await import("../lib/submissions");
    const v1 = await submitAssignment({
      userId: "user_s003",
      assignmentId: "asg_s3_datamemo",
      fields: DATA_MEMO_FIELDS,
      files: [],
    });
    const v2 = await submitAssignment({
      userId: "user_s003",
      assignmentId: "asg_s3_datamemo",
      fields: { ...DATA_MEMO_FIELDS, aiGotWrong: "Revised: it also miscounted rows." },
      files: [],
    });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.id).not.toBe(v1.id);
    const v1Row = await prisma.submission.findUnique({ where: { id: v1.id } });
    expect(v1Row).not.toBeNull();
    expect(v1Row!.version).toBe(1);
    expect((v1Row!.fields as { aiGotWrong: string }).aiGotWrong).toBe(
      DATA_MEMO_FIELDS.aiGotWrong,
    );
    expect(v2.contentHash).not.toBe(v1.contentHash);
  });

  it("invalid fields → per-field errors, no row written", async () => {
    const { submitAssignment, SubmissionValidationError } = await import("../lib/submissions");
    const before = await prisma.submission.count({ where: { userId: "user_s004" } });
    try {
      await submitAssignment({
        userId: "user_s004",
        assignmentId: "asg_s2_skill",
        fields: { skillLink: "not-a-url", bogus: "x" }, // bad URL, unknown key, missing writeup
        files: [],
      });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SubmissionValidationError);
      const errors = (e as InstanceType<typeof SubmissionValidationError>).errors;
      expect(errors.some((m) => m.includes("skillLink"))).toBe(true);
      expect(errors.some((m) => m.includes("writeup"))).toBe(true);
      expect(errors.some((m) => m.includes("bogus"))).toBe(true);
    }
    expect(await prisma.submission.count({ where: { userId: "user_s004" } })).toBe(before);
  });

  it("closed gate rejects with a clear message; a per-student exception admits only that student", async () => {
    const { setGateState, grantException } = await import("../lib/gates");
    const { submitAssignment, GateClosedError } = await import("../lib/submissions");
    await setGateState({
      targetType: "assignment",
      targetId: "asg_s3_datamemo",
      sectionId: "sec_A",
      state: "closed",
      actorId: INSTRUCTOR,
    });

    await expect(
      submitAssignment({
        userId: "user_s005",
        assignmentId: "asg_s3_datamemo",
        fields: DATA_MEMO_FIELDS,
        files: [],
      }),
    ).rejects.toThrow(GateClosedError);
    await expect(
      submitAssignment({
        userId: "user_s005",
        assignmentId: "asg_s3_datamemo",
        fields: DATA_MEMO_FIELDS,
        files: [],
      }),
    ).rejects.toThrow(/closed/i);

    // Exception admits exactly the granted student.
    await grantException({
      targetType: "assignment",
      targetId: "asg_s3_datamemo",
      sectionId: "sec_A",
      userId: "user_s005",
      grantedBy: INSTRUCTOR,
    });
    const sub = await submitAssignment({
      userId: "user_s005",
      assignmentId: "asg_s3_datamemo",
      fields: DATA_MEMO_FIELDS,
      files: [],
    });
    expect(sub.status).toBe("submitted");
    await expect(
      submitAssignment({
        userId: "user_s006",
        assignmentId: "asg_s3_datamemo",
        fields: DATA_MEMO_FIELDS,
        files: [],
      }),
    ).rejects.toThrow(GateClosedError);

    // Restore for later tests (section B+ untouched throughout).
    await setGateState({
      targetType: "assignment",
      targetId: "asg_s3_datamemo",
      sectionId: "sec_A",
      state: "open",
      actorId: INSTRUCTOR,
    });
  });

  it("team-based type writes teamId; a student without a team gets a clear error", async () => {
    const { setGateState } = await import("../lib/gates");
    const { submitAssignment, SubmissionValidationError } = await import("../lib/submissions");
    // Open S5 workflow for section A (session 5 + assignment gates).
    await setGateState({
      targetType: "session",
      targetId: "spage_5",
      sectionId: "sec_A",
      state: "open",
      actorId: INSTRUCTOR,
    });
    await setGateState({
      targetType: "assignment",
      targetId: "asg_s5_workflow",
      sectionId: "sec_A",
      state: "open",
      actorId: INSTRUCTOR,
    });

    const me = await prisma.user.findUnique({ where: { id: "user_s007" } });
    const sub = await submitAssignment({
      userId: "user_s007",
      assignmentId: "asg_s5_workflow",
      fields: {
        blueprintFile: "submissions/user_s007/draft1/blueprint.json",
        recordingFile: "submissions/user_s007/draft1/recording.mp4",
        usefulness: "Saves the ops lead ~40 minutes a week of copy-paste.",
      },
      files: [
        "submissions/user_s007/draft1/blueprint.json",
        "submissions/user_s007/draft1/recording.mp4",
      ],
    });
    expect(sub.teamId).toBe(me!.teamId);

    // Teamless student on a team-based type → clear error.
    await prisma.user.upsert({
      where: { id: "user_test_teamless" },
      update: { teamId: null, sectionId: "sec_A" },
      create: {
        id: "user_test_teamless",
        email: "teamless@test.local",
        name: "Teamless Tester",
        role: "student",
        sectionId: "sec_A",
      },
    });
    await expect(
      submitAssignment({
        userId: "user_test_teamless",
        assignmentId: "asg_s5_workflow",
        fields: {
          blueprintFile: "submissions/user_test_teamless/d/blueprint.json",
          recordingFile: "submissions/user_test_teamless/d/recording.mp4",
          usefulness: "x",
        },
        files: [
          "submissions/user_test_teamless/d/blueprint.json",
          "submissions/user_test_teamless/d/recording.mp4",
        ],
      }),
    ).rejects.toThrow(SubmissionValidationError);
    await expect(
      submitAssignment({
        userId: "user_test_teamless",
        assignmentId: "asg_s5_workflow",
        fields: {
          blueprintFile: "submissions/user_test_teamless/d/blueprint.json",
          recordingFile: "submissions/user_test_teamless/d/recording.mp4",
          usefulness: "x",
        },
        files: ["submissions/user_test_teamless/d/blueprint.json"],
      }),
    ).rejects.toThrow(/team/i);
  });

  it("foreign-namespace file key → ForeignFileKeyError (403-mapped)", async () => {
    const { submitAssignment, ForeignFileKeyError } = await import("../lib/submissions");
    await expect(
      submitAssignment({
        userId: "user_s008",
        assignmentId: "asg_s3_datamemo",
        fields: {
          ...DATA_MEMO_FIELDS,
          evidenceFile: "submissions/user_s009/stolen/evidence.png",
        },
        files: ["submissions/user_s009/stolen/evidence.png"],
      }),
    ).rejects.toThrow(ForeignFileKeyError);
  });

  it("getAssignmentForStudent returns schema, gate availability, and my version history", async () => {
    const { getAssignmentForStudent } = await import("../lib/submissions");
    // user_s001 has seeded skill v1 (sub_001) + v2 (sub_031-ish, version 2).
    const view = await getAssignmentForStudent("user_s001", "asg_s2_skill");
    expect(view).not.toBeNull();
    expect(view!.available).toBe(true);
    expect(view!.schema?.fields.map((f) => f.key)).toEqual(["skillLink", "writeup"]);
    expect(view!.history.length).toBeGreaterThanOrEqual(2);
    expect(view!.history[0].version).toBeGreaterThan(view!.history[1].version);
    expect(view!.latest?.version).toBe(view!.history[0].version);

    // Locked assignment → available false.
    const locked = await getAssignmentForStudent("user_s001", "asg_s4_app");
    expect(locked!.available).toBe(false);
  });

  it("extensibility: a NEW AssignmentType (via the admin code path) accepts a submission with zero code changes", async () => {
    const { createAssignmentType } = await import("../lib/assignment-types");
    const { setGateState } = await import("../lib/gates");
    const { submitAssignment, SubmissionValidationError } = await import("../lib/submissions");

    const type = await createAssignmentType(
      {
        slug: "reflection-x",
        title: "Session reflection",
        description: "A novel artifact kind created at runtime.",
        teamBased: false,
        galleryEligible: false,
        submissionSchema: {
          fields: [
            { key: "reflection", label: "Your reflection", kind: "writeup", required: true },
            { key: "resourceUrl", label: "One resource", kind: "link", required: true },
            { key: "extraNote", label: "Optional note", kind: "text", required: false },
          ],
        },
      },
      ADMIN,
    );
    const assignment = await prisma.assignment.create({
      data: {
        id: "asg_test_reflection",
        assignmentTypeId: type.id,
        title: "Test · Session reflection",
        brief: "Reflect.",
        sectionIds: ["sec_A"],
      },
    });
    await setGateState({
      targetType: "assignment",
      targetId: assignment.id,
      sectionId: "sec_A",
      state: "open",
      actorId: INSTRUCTOR,
    });

    // The generic pipeline validates against the novel schema…
    await expect(
      submitAssignment({
        userId: "user_s010",
        assignmentId: assignment.id,
        fields: { reflection: "Learned a lot.", resourceUrl: "not a url" },
        files: [],
      }),
    ).rejects.toThrow(SubmissionValidationError);

    // …and accepts a valid one.
    const sub = await submitAssignment({
      userId: "user_s010",
      assignmentId: assignment.id,
      fields: {
        reflection: "Shipping the memo taught me to re-derive numbers before trusting them.",
        resourceUrl: "https://example.com/notes",
      },
      files: [],
    });
    expect(sub.version).toBe(1);
    expect(sub.status).toBe("submitted");

    // Slug uniqueness is enforced by the same code path.
    await expect(
      createAssignmentType(
        {
          slug: "reflection-x",
          title: "Duplicate",
          description: "d",
          teamBased: false,
          galleryEligible: false,
          submissionSchema: { fields: [{ key: "a", label: "A", kind: "text", required: true }] },
        },
        ADMIN,
      ),
    ).rejects.toThrow(/slug/i);
  });

  it("team resubmission by a different teammate continues the team's version sequence, not a fresh v1 (#12)", async () => {
    const { setGateState } = await import("../lib/gates");
    const { submitAssignment } = await import("../lib/submissions");
    // Ensure the S5 workflow gates are open for section A (team_A1 = s001..s008).
    await setGateState({ targetType: "session", targetId: "spage_5", sectionId: "sec_A", state: "open", actorId: INSTRUCTOR });
    await setGateState({ targetType: "assignment", targetId: "asg_s5_workflow", sectionId: "sec_A", state: "open", actorId: INSTRUCTOR });

    const workflowFields = (owner: string) => ({
      blueprintFile: `submissions/${owner}/wf/blueprint.json`,
      recordingFile: `submissions/${owner}/wf/recording.mp4`,
      usefulness: "Automates the team's weekly ops reconciliation; saves ~40 min.",
      files: [`submissions/${owner}/wf/blueprint.json`, `submissions/${owner}/wf/recording.mp4`],
    });

    const a = workflowFields("user_s001");
    const first = await submitAssignment({
      userId: "user_s001",
      assignmentId: "asg_s5_workflow",
      fields: { blueprintFile: a.blueprintFile, recordingFile: a.recordingFile, usefulness: a.usefulness },
      files: a.files,
    });
    const b = workflowFields("user_s002");
    const second = await submitAssignment({
      userId: "user_s002",
      assignmentId: "asg_s5_workflow",
      fields: { blueprintFile: b.blueprintFile, recordingFile: b.recordingFile, usefulness: b.usefulness },
      files: b.files,
    });

    // Same team, and the second teammate's version is exactly one past the
    // first's — the counter is per-TEAM, not per-user (per-user would reset to
    // v1 for a teammate who never personally submitted this assignment).
    expect(second.teamId).toBe(first.teamId);
    expect(second.version).toBe(first.version + 1);
    expect(second.version).toBeGreaterThan(1);
  });

  it("listStuckSubmissions surfaces submissions stuck at 'submitted' past the age cutoff, ignoring fresh ones (#13)", async () => {
    const { listStuckSubmissions } = await import("../lib/submissions");

    await prisma.submission.create({
      data: {
        id: "sub_stuck_test",
        assignmentId: "asg_s2_skill",
        userId: "user_s001",
        status: "submitted",
        submittedAt: new Date(Date.now() - 20 * 60_000), // 20 min ago
        fields: { skillLink: "https://x.example/s", writeup: "stuck" },
        files: [],
        version: 990,
        contentHash: "stuckhash_990",
        createdAt: new Date(Date.now() - 20 * 60_000),
      },
    });
    await prisma.submission.create({
      data: {
        id: "sub_fresh_test",
        assignmentId: "asg_s2_skill",
        userId: "user_s001",
        status: "submitted",
        submittedAt: new Date(), // just now → not stuck yet
        fields: { skillLink: "https://x.example/f", writeup: "fresh" },
        files: [],
        version: 991,
        contentHash: "stuckhash_991",
        createdAt: new Date(),
      },
    });

    try {
      const rows = await listStuckSubmissions();
      const ids = rows.map((r) => r.id);
      expect(ids).toContain("sub_stuck_test");
      expect(ids).not.toContain("sub_fresh_test");
      // Rows carry the student email for the admin ops table.
      const row = rows.find((r) => r.id === "sub_stuck_test")!;
      expect(row.user.email).toBe("student001@mastersunion.org");
      expect(rows.every((r) => r.submittedAt !== null)).toBe(true);
    } finally {
      await prisma.submission.deleteMany({
        where: { id: { in: ["sub_stuck_test", "sub_fresh_test"] } },
      });
    }
  });
});
