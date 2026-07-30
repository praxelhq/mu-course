import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../lib/auth";
import {
  ResubmissionGrantAdminError,
  extendResubmissionGrant,
  issueRepairGrant,
  type GrantRecord,
  type RepairGrantSource,
  type ResubmissionGrantAdminStore,
} from "../lib/resubmission-grant-admin";

const now = new Date("2026-08-01T00:00:00.000Z");
const sourceUpdatedAt = new Date("2026-08-01T00:05:00.000Z");
const originalExpiry = new Date("2026-08-05T00:00:00.000Z");
const requestedExpiry = new Date("2026-08-10T00:00:00.000Z");

const target = {
  assignmentId: "assignment-5",
  assessmentVersionId: "assessment-v2",
  ownerKind: "individual" as const,
  ownerId: "student-1",
  targetVersion: 2,
  targetAttempt: 2,
};

const actor = { userId: "instructor-1", role: "instructor" as const };

function source(patch: Partial<RepairGrantSource> = {}): RepairGrantSource {
  return {
    id: "submission-v2-a1",
    status: "graded",
    assignmentId: target.assignmentId,
    assessmentVersionId: target.assessmentVersionId,
    ownerKind: target.ownerKind,
    ownerId: target.ownerId,
    version: target.targetVersion,
    attempt: 1,
    updatedAt: sourceUpdatedAt,
    ...patch,
  };
}

function grant(patch: Partial<GrantRecord> = {}): GrantRecord {
  return {
    id: "grant-1",
    ...target,
    kind: "repair",
    issuedBy: actor.userId,
    trigger: "instructor_repair",
    reason: "Repair quarantined evidence.",
    expiresAt: originalExpiry,
    extendedAt: null,
    extendedBy: null,
    extensionReason: null,
    consumedAt: null,
    sourceSubmissionId: "submission-v2-a1",
    updatedAt: sourceUpdatedAt,
    ...patch,
  };
}

function harness(options: {
  source?: RepairGrantSource | null;
  grants?: GrantRecord[];
  maxAttempt?: number | null;
} = {}) {
  const sourceRow = options.source === undefined ? source() : options.source;
  const grants = structuredClone(options.grants ?? []);
  const audits: Parameters<ResubmissionGrantAdminStore["createAudit"]>[0][] = [];
  const store: ResubmissionGrantAdminStore = {
    getSource: async (id) =>
      sourceRow?.id === id ? structuredClone(sourceRow) : null,
    maxAttempt: async () => options.maxAttempt ?? 1,
    getTargetGrant: async (requested) =>
      structuredClone(
        grants.find(
          (row) =>
            row.kind === requested.kind &&
            row.assignmentId === requested.assignmentId &&
            row.assessmentVersionId === requested.assessmentVersionId &&
            row.ownerKind === requested.ownerKind &&
            row.ownerId === requested.ownerId &&
            row.targetVersion === requested.targetVersion &&
            row.targetAttempt === requested.targetAttempt,
        ) ?? null,
      ),
    createRepairGrant: async (input) => {
      const row = grant({
        id: `grant-${grants.length + 1}`,
        ...input,
        expiresAt: input.expiresAt,
        sourceSubmissionId: input.sourceSubmissionId,
        updatedAt: now,
      });
      grants.push(row);
      return structuredClone(row);
    },
    getGrant: async (id) => structuredClone(grants.find((row) => row.id === id) ?? null),
    compareAndSetExtension: async (input) => {
      const row = grants.find((candidate) => candidate.id === input.grantId);
      if (
        !row ||
        row.consumedAt ||
        row.updatedAt.getTime() !== input.expectedUpdatedAt.getTime() ||
        row.expiresAt.getTime() !== input.expectedExpiresAt.getTime()
      ) {
        return null;
      }
      Object.assign(row, {
        expiresAt: input.expiresAt,
        extendedAt: input.extendedAt,
        extendedBy: input.extendedBy,
        extensionReason: input.reason,
        updatedAt: new Date(row.updatedAt.getTime() + 1_000),
      });
      return structuredClone(row);
    },
    createAudit: async (entry) => {
      audits.push(entry);
    },
  };
  const deps = {
    now: () => now,
    transaction: async <T>(work: (tx: ResubmissionGrantAdminStore) => Promise<T>) =>
      work(store),
  };
  return { audits, deps, grants };
}

function issueInput() {
  return {
    ...target,
    sourceSubmissionId: "submission-v2-a1",
    expectedSourceUpdatedAt: sourceUpdatedAt,
    expiresAt: requestedExpiry,
    reason: "Repair quarantined evidence.",
    actor,
  };
}

function extendInput() {
  return {
    ...target,
    grantId: "grant-1",
    expectedUpdatedAt: sourceUpdatedAt,
    expiresAt: requestedExpiry,
    reason: "Learner needs additional upload time.",
    actor,
  };
}

describe("instructor resubmission grants", () => {
  it("issues the exact next repair attempt once and audits the transition", async () => {
    const h = harness();
    const outcome = await issueRepairGrant(issueInput(), h.deps);
    expect(outcome).toMatchObject({
      changed: true,
      grant: { ...target, sourceSubmissionId: "submission-v2-a1" },
    });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      action: "submission.repair-grant.issue",
      actorId: "instructor-1",
    });
  });

  it("makes an identical issue retry idempotent without a second audit", async () => {
    const h = harness();
    expect((await issueRepairGrant(issueInput(), h.deps)).changed).toBe(true);
    expect((await issueRepairGrant(issueInput(), h.deps)).changed).toBe(false);
    expect(h.audits).toHaveLength(1);
  });

  it.each([
    ["student actor", { actor: { userId: "student-1", role: "student" as const } }, 403],
    ["stale source", { expectedSourceUpdatedAt: new Date(0) }, 409],
    ["wrong owner", { ownerId: "student-2" }, 409],
    ["wrong next attempt", { targetAttempt: 3 }, 409],
    ["past expiry", { expiresAt: new Date("2026-07-31T00:00:00.000Z") }, 400],
    ["oversized window", { expiresAt: new Date("2026-12-01T00:00:00.000Z") }, 400],
  ])("rejects %s", async (_label, patch, status) => {
    const h = harness();
    await expect(issueRepairGrant({ ...issueInput(), ...patch }, h.deps)).rejects.toMatchObject({
      status,
    });
    expect(h.audits).toHaveLength(0);
  });

  it("extends an exact unconsumed grant with CAS and one audit", async () => {
    const h = harness({ grants: [grant()] });
    const outcome = await extendResubmissionGrant(extendInput(), h.deps);
    expect(outcome).toMatchObject({ changed: true, grant: { expiresAt: requestedExpiry } });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0].action).toBe("submission.grant.extend");
  });

  it("returns an idempotent extension retry despite its stale original timestamp", async () => {
    const h = harness({ grants: [grant()] });
    expect((await extendResubmissionGrant(extendInput(), h.deps)).changed).toBe(true);
    expect((await extendResubmissionGrant(extendInput(), h.deps)).changed).toBe(false);
    expect(h.audits).toHaveLength(1);
  });

  it.each([
    ["target mismatch", grant({ ownerId: "student-2" }), 409],
    ["consumed grant", grant({ consumedAt: now }), 409],
    ["stale CAS", grant({ updatedAt: new Date("2026-08-01T00:06:00.000Z") }), 409],
    ["non-forward expiry", grant({ expiresAt: requestedExpiry }), 400],
  ])("rejects extension for %s", async (_label, row, status) => {
    const h = harness({ grants: [row] });
    await expect(extendResubmissionGrant(extendInput(), h.deps)).rejects.toMatchObject({ status });
  });
});

function request(body: unknown): Request {
  return new Request("http://test.local/api/instructor/submission-grants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const instructorSession: SessionUser = {
  userId: "instructor-1",
  email: "instructor@example.edu",
  role: "instructor",
  sectionId: null,
  teamId: null,
};

const studentSession: SessionUser = {
  userId: "student-1",
  email: "student@example.edu",
  role: "student",
  sectionId: "section-a",
  teamId: null,
};

describe("submission grant instructor route", () => {
  it("role-gates and rejects client actor or unknown keys", async () => {
    const { createInstructorSubmissionGrantHandler } = await import(
      "../app/api/instructor/submission-grants/route"
    );
    const issue = vi.fn();
    const body = {
      action: "issue-repair",
      ...target,
      sourceSubmissionId: "submission-v2-a1",
      expectedSourceUpdatedAt: sourceUpdatedAt.toISOString(),
      expiresAt: requestedExpiry.toISOString(),
      reason: "Repair quarantined evidence.",
    };
    const studentHandler = createInstructorSubmissionGrantHandler({
      getUser: async () => studentSession,
      issue,
    });
    expect((await studentHandler(request(body))).status).toBe(403);
    const handler = createInstructorSubmissionGrantHandler({
      getUser: async () => instructorSession,
      issue,
    });
    expect((await handler(request({ ...body, issuedBy: "client" }))).status).toBe(400);
    expect(issue).not.toHaveBeenCalled();
  });

  it("derives the actor and maps grant conflicts", async () => {
    const { createInstructorSubmissionGrantHandler } = await import(
      "../app/api/instructor/submission-grants/route"
    );
    const issue = vi.fn().mockResolvedValue({ changed: true, grant: { id: "grant-1" } });
    const handler = createInstructorSubmissionGrantHandler({
      getUser: async () => instructorSession,
      issue,
    });
    const body = {
      action: "issue-repair",
      ...target,
      sourceSubmissionId: "submission-v2-a1",
      expectedSourceUpdatedAt: sourceUpdatedAt.toISOString(),
      expiresAt: requestedExpiry.toISOString(),
      reason: "Repair quarantined evidence.",
    };
    expect((await handler(request(body))).status).toBe(200);
    expect(issue).toHaveBeenCalledWith({
      ...target,
      sourceSubmissionId: "submission-v2-a1",
      expectedSourceUpdatedAt: sourceUpdatedAt,
      expiresAt: requestedExpiry,
      reason: "Repair quarantined evidence.",
      actor,
    });
    issue.mockRejectedValueOnce(new ResubmissionGrantAdminError(409, "Target changed"));
    expect((await handler(request(body))).status).toBe(409);
  });
});
