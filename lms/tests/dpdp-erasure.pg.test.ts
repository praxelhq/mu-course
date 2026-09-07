import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  DPDP_RECEIPT_GUC,
  eraseDpdpUser,
} from "../lib/dpdp-erasure-prisma";
import { prismaRetentionPersistence } from "../worker/jobs/retention-cleanup";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

const runLive = process.env.RUN_DPDP_ERASURE_PG_TESTS === "1";
const NOW = new Date("2026-07-30T12:00:00.000Z");
const ADMIN = "dpdp-pg-admin";
const SECTION_ID = "dpdp-pg-section";
const ASSIGNMENT_TYPE_ID = "dpdp-pg-assignment-type";
const ASSIGNMENT_ID = "dpdp-pg-assignment";
const VERSIONED_ASSIGNMENT_ID = "dpdp-pg-versioned-assignment";
const ASSESSMENT_VERSION_ID = "dpdp-pg-assessment-version";
const QUIZ_ID = "dpdp-pg-quiz";

describe.skipIf(!runLive)("DPDP erasure against migrated PostgreSQL", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    db = new PrismaClient();
    await db.section.create({
      data: { id: SECTION_ID, code: "DPDP-PG", name: "DPDP PostgreSQL tests" },
    });
    await db.assignmentType.create({
      data: {
        id: ASSIGNMENT_TYPE_ID,
        slug: "dpdp-pg-artifact",
        title: "DPDP artifact",
        description: "Disposable erasure fixture",
        submissionSchema: { fields: [] },
        rubric: { criteria: [] },
      },
    });
    await db.assignment.create({
      data: {
        id: ASSIGNMENT_ID,
        assignmentTypeId: ASSIGNMENT_TYPE_ID,
        title: "DPDP fixture assignment",
        brief: "Disposable",
        sectionIds: [SECTION_ID],
        contractMode: "legacy",
      },
    });
    await db.assignment.create({
      data: {
        id: VERSIONED_ASSIGNMENT_ID,
        assignmentTypeId: ASSIGNMENT_TYPE_ID,
        title: "DPDP versioned fixture assignment",
        brief: "Disposable versioned contract",
        sectionIds: [SECTION_ID],
        contractMode: "legacy",
      },
    });
    await db.assessmentVersion.create({
      data: {
        id: ASSESSMENT_VERSION_ID,
        assignmentId: VERSIONED_ASSIGNMENT_ID,
        version: 1,
        ownerKind: "individual",
        purpose: "graded",
        publicSchema: { version: 1, fields: [] },
        rubric: { criteria: [] },
        materialManifest: [],
        checksumSha256: "a".repeat(64),
        scoringPolicy: { mode: "deterministic" },
        portfolioPolicy: { enabled: false },
        publicationPolicy: { enabled: false },
        exportPolicy: { enabled: false },
        previewPolicy: { enabled: false },
        createdBy: ADMIN,
      },
    });
    await db.assessmentEvaluatorConfig.create({
      data: {
        id: "dpdp-pg-evaluator-config",
        assessmentVersionId: ASSESSMENT_VERSION_ID,
        config: { mode: "deterministic" },
        checksumSha256: "b".repeat(64),
      },
    });
    await db.assessmentVersion.update({
      where: { id: ASSESSMENT_VERSION_ID },
      data: { publishedAt: NOW },
    });
    await db.assignment.update({
      where: { id: VERSIONED_ASSIGNMENT_ID },
      data: {
        activeAssessmentVersionId: ASSESSMENT_VERSION_ID,
        contractMode: "versioned",
      },
    });
    await db.quiz.create({
      data: {
        id: QUIZ_ID,
        sessionNo: 99,
        title: "DPDP fixture quiz",
        questions: [],
        sectionIds: [SECTION_ID],
      },
    });
  }, 30_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  async function createTeam(suffix: string) {
    const teamId = `dpdp-pg-team-${suffix}`;
    await db.team.create({
      data: {
        id: teamId,
        sectionId: SECTION_ID,
        name: `DPDP team ${suffix}`,
        sectorName: "Testing",
      },
    });
    return teamId;
  }

  async function createUser(suffix: string, teamId: string | null = null) {
    const id = `dpdp-pg-user-${suffix}`;
    const email = `${id}@example.test`;
    const name = `DPDP ${suffix}`;
    const clerkUserId = `clerk-${id}`;
    const avatarUrl = `https://avatars.example.test/${id}.png`;
    await db.user.create({
      data: {
        id,
        email,
        name,
        role: "student",
        sectionId: SECTION_ID,
        teamId,
        clerkUserId,
        avatarUrl,
      },
    });
    return { id, email, name, clerkUserId, avatarUrl };
  }

  async function createSubmission(input: {
    suffix: string;
    userId: string;
    teamId?: string | null;
    files?: string[];
    finalised?: boolean;
    versioned?: boolean;
    version?: number;
    attempt?: number;
    resubmissionGrantId?: string | null;
  }) {
    const id = `dpdp-pg-submission-${input.suffix}`;
    await db.submission.create({
      data: {
        id,
        assignmentId: input.versioned ? VERSIONED_ASSIGNMENT_ID : ASSIGNMENT_ID,
        userId: input.userId,
        teamId: input.teamId ?? null,
        status: "draft",
        submittedAt: null,
        fields: { title: `Artifact ${input.suffix}`, body: "immutable team content" },
        files: input.files ?? [],
        ownerKind: input.teamId ? "team" : "individual",
        ownerId: input.teamId ?? input.userId,
        assessmentVersionId: input.versioned ? ASSESSMENT_VERSION_ID : null,
        version: input.version ?? 1,
        attempt: input.attempt ?? 1,
        resubmissionGrantId: input.resubmissionGrantId ?? null,
        contentHash: `content-${input.suffix}`,
      },
    });
    if (input.finalised) await finaliseSubmission(id);
    return id;
  }

  async function finaliseSubmission(submissionId: string) {
    await db.submission.update({
      where: { id: submissionId },
      data: { status: "submitted", submittedAt: NOW },
    });
    await db.submission.update({
      where: { id: submissionId },
      data: { status: "finalised" },
    });
  }

  async function attachEvidence(input: {
    suffix: string;
    submissionId: string;
    userId: string;
    key: string;
    versionId: string | null;
    cancelledAt?: Date | null;
    fieldKey?: string;
    fileRole?: string;
    scanState?: "clean" | "quarantined";
    replacesEvidenceId?: string | null;
  }) {
    const reservationId = `dpdp-pg-reservation-${input.suffix}`;
    const evidenceId = `dpdp-pg-evidence-${input.suffix}`;
    const submission = await db.submission.findUniqueOrThrow({
      where: { id: input.submissionId },
      select: {
        assignmentId: true,
        assessmentVersionId: true,
        ownerKind: true,
        ownerId: true,
      },
    });
    const fieldKey = input.fieldKey ?? "artifact";
    const fileRole = input.fileRole ?? "artifactFile";
    await db.uploadReservation.create({
      data: {
        id: reservationId,
        submissionId: input.submissionId,
        assignmentId: submission.assignmentId,
        assessmentVersionId: submission.assessmentVersionId,
        ownerKind: submission.ownerKind!,
        ownerId: submission.ownerId!,
        createdById: input.userId,
        fieldKey,
        fileRole,
        filename: `${input.suffix}.json`,
        s3Key: input.key,
        s3VersionId: null,
        declaredContentType: "application/json",
        declaredBytes: 16,
        expiresAt: new Date("2026-08-01T12:00:00.000Z"),
        consumedAt: null,
        cancelledAt: null,
      },
    });
    if (input.versionId) {
      await db.uploadReservation.update({
        where: { id: reservationId },
        data: { s3VersionId: input.versionId, consumedAt: NOW },
      });
      await db.submissionEvidence.create({
        data: {
          id: evidenceId,
          submissionId: input.submissionId,
          reservationId,
          fieldKey,
          fileRole,
          s3Key: input.key,
          s3VersionId: input.versionId,
          etag: `etag-${input.suffix}`,
          sha256: "c".repeat(64),
          byteCount: 16,
          declaredContentType: "application/json",
          inspectedMimeType: "application/json",
          scanState: input.scanState ?? "clean",
          quarantineReasonCode:
            input.scanState === "quarantined" ? "fixture_quarantine" : null,
          replacesEvidenceId: input.replacesEvidenceId ?? null,
        },
      });
    } else if (input.cancelledAt) {
      await db.uploadReservation.update({
        where: { id: reservationId },
        data: { cancelledAt: input.cancelledAt },
      });
    }
    return { reservationId, evidenceId: input.versionId ? evidenceId : null };
  }

  async function createGeneratedReservation(input: {
    id: string;
    purpose:
      | "gallery_screenshot"
      | "publication_preview"
      | "interview_recording"
      | "interview_video"
      | "interview_prerequisite"
      | "interview_turn_audio";
    submissionId?: string;
    interviewId?: string;
    targetId: string;
    key: string;
    versionId?: string;
    consume?: boolean;
    expiresAt?: Date;
  }) {
    await db.generatedObjectReservation.create({
      data: {
        id: input.id,
        purpose: input.purpose,
        submissionId: input.submissionId,
        interviewId: input.interviewId,
        targetId: input.targetId,
        s3Key: input.key,
        expiresAt:
          input.expiresAt ?? new Date("2026-08-01T12:00:00.000Z"),
      },
    });
    if (input.versionId) {
      await db.generatedObjectReservation.update({
        where: { id: input.id },
        data: { s3VersionId: input.versionId },
      });
      if (input.consume !== false) {
        await db.generatedObjectReservation.update({
          where: { id: input.id },
          data: { consumedAt: NOW },
        });
      }
    }
    return input.id;
  }

  it("rejects non-student principals from the learner erasure workflow", async () => {
    const id = "dpdp-pg-instructor-erasure-rejected";
    const email = `${id}@example.test`;
    await db.user.create({
      data: {
        id,
        email,
        name: "DPDP instructor",
        role: "instructor",
        sectionId: SECTION_ID,
      },
    });

    await expect(
      eraseDpdpUser(
        { userId: id, confirmEmail: email, requestedBy: ADMIN, now: NOW },
        { db, deleteObjectVersion: vi.fn() },
      ),
    ).rejects.toThrow(/Only student records/);
    expect(await db.user.findUnique({ where: { id } })).not.toBeNull();
    expect(
      await db.deletionReceipt.count({ where: { targetType: "dpdp-user", targetId: id } }),
    ).toBe(0);
  });

  it("prepares an uncommitted-upload retention intent through PostgreSQL advisory locks", async () => {
    const user = await createUser("retention-lock");
    const key = "submissions/dpdp-pg/retention-lock/artifact.json";
    const versionId = "version-retention-lock";
    const submissionId = await createSubmission({
      suffix: "retention-lock",
      userId: user.id,
    });
    const object = await attachEvidence({
      suffix: "retention-lock",
      submissionId,
      userId: user.id,
      key,
      versionId: null,
    });
    await db.uploadReservation.update({
      where: { id: object.reservationId },
      data: { s3VersionId: versionId },
    });
    const idempotencyKey = `retention:uncommitted-upload:${object.reservationId}:${versionId}`;

    await expect(
      prismaRetentionPersistence(db).prepareDeletion({
        idempotencyKey,
        retentionPolicyId: null,
        targetType: "uncommitted-upload",
        targetId: object.reservationId,
        expiresAt: NOW,
        s3Key: key,
        s3VersionId: versionId,
        databaseAction: "mark-cancelled",
      }),
    ).resolves.toBe("ready");
    expect(
      await db.deletionReceipt.findUnique({ where: { idempotencyKey } }),
    ).toMatchObject({
      targetType: "uncommitted-upload",
      targetId: object.reservationId,
      s3Key: key,
      s3VersionId: versionId,
      s3VerifiedAt: null,
      databaseVerifiedAt: null,
      details: {
        phase: "intent",
        databaseAction: "mark-cancelled",
        submissionId,
      },
    });
  });

  it("accepts only an exact same-field quarantined evidence replacement", async () => {
    const user = await createUser("replacement-contract");
    const firstSubmissionId = await createSubmission({
      suffix: "replacement-contract-a",
      userId: user.id,
    });
    const otherSubmissionId = await createSubmission({
      suffix: "replacement-contract-b",
      userId: user.id,
    });
    const quarantined = await attachEvidence({
      suffix: "replacement-contract-quarantined",
      submissionId: firstSubmissionId,
      userId: user.id,
      key: "submissions/dpdp-pg/replacement/quarantined.json",
      versionId: "version-replacement-quarantined",
      scanState: "quarantined",
    });

    await expect(
      attachEvidence({
        suffix: "replacement-contract-cross-submission",
        submissionId: otherSubmissionId,
        userId: user.id,
        key: "submissions/dpdp-pg/replacement/cross-submission.json",
        versionId: "version-replacement-cross-submission",
        replacesEvidenceId: quarantined.evidenceId,
      }),
    ).rejects.toThrow(/same submission field and role/i);
    await expect(
      attachEvidence({
        suffix: "replacement-contract-cross-field",
        submissionId: firstSubmissionId,
        userId: user.id,
        key: "submissions/dpdp-pg/replacement/cross-field.json",
        versionId: "version-replacement-cross-field",
        fieldKey: "other-field",
        replacesEvidenceId: quarantined.evidenceId,
      }),
    ).rejects.toThrow(/same submission field and role/i);
    await expect(
      attachEvidence({
        suffix: "replacement-contract-cross-role",
        submissionId: firstSubmissionId,
        userId: user.id,
        key: "submissions/dpdp-pg/replacement/cross-role.json",
        versionId: "version-replacement-cross-role",
        fileRole: "other-role",
        replacesEvidenceId: quarantined.evidenceId,
      }),
    ).rejects.toThrow(/same submission field and role/i);

    await expect(
      attachEvidence({
        suffix: "replacement-contract-valid",
        submissionId: firstSubmissionId,
        userId: user.id,
        key: "submissions/dpdp-pg/replacement/valid.json",
        versionId: "version-replacement-valid",
        replacesEvidenceId: quarantined.evidenceId,
      }),
    ).resolves.toMatchObject({ evidenceId: "dpdp-pg-evidence-replacement-contract-valid" });
  });

  it("freezes a clean replacement while retention owns its quarantined predecessor", async () => {
    const user = await createUser("replacement-retention-race");
    const submissionId = await createSubmission({
      suffix: "replacement-retention-race",
      userId: user.id,
    });
    const quarantinedKey = "submissions/dpdp-pg/replacement-race/quarantined.json";
    const quarantinedVersion = "version-replacement-retention-race";
    const quarantined = await attachEvidence({
      suffix: "replacement-retention-race-quarantined",
      submissionId,
      userId: user.id,
      key: quarantinedKey,
      versionId: quarantinedVersion,
      scanState: "quarantined",
    });
    const replacement = await attachEvidence({
      suffix: "replacement-retention-race-clean",
      submissionId,
      userId: user.id,
      key: "submissions/dpdp-pg/replacement-race/clean.json",
      versionId: "version-replacement-retention-race-clean",
      replacesEvidenceId: quarantined.evidenceId,
    });
    const idempotencyKey = [
      "retention",
      "submission-evidence-quarantined",
      quarantined.evidenceId,
      quarantinedVersion,
    ].join(":");
    const persistence = prismaRetentionPersistence(db);

    await expect(
      persistence.prepareDeletion({
        idempotencyKey,
        retentionPolicyId: null,
        targetType: "submission-evidence-quarantined",
        targetId: quarantined.evidenceId!,
        expiresAt: NOW,
        s3Key: quarantinedKey,
        s3VersionId: quarantinedVersion,
        databaseAction: "mark-deleted",
      }),
    ).resolves.toBe("ready");
    await expect(
      db.submissionEvidence.update({
        where: { id: replacement.evidenceId! },
        data: {
          scanState: "quarantined",
          quarantineReasonCode: "late_scan_failure",
        },
      }),
    ).rejects.toThrow(/frozen by pending retention deletion intent/i);

    await persistence.commitDeletion({
      idempotencyKey,
      retentionPolicyId: null,
      targetType: "submission-evidence-quarantined",
      targetId: quarantined.evidenceId!,
      s3Key: quarantinedKey,
      s3VersionId: quarantinedVersion,
      requestedBy: "retention-worker",
      deletedAt: NOW,
      s3Verified: true,
      providerReceipt: "provider-replacement-race",
      databaseAction: "mark-deleted",
    });
    expect(
      await db.submissionEvidence.findUnique({
        where: { id: quarantined.evidenceId! },
        select: { scanState: true },
      }),
    ).toEqual({ scanState: "deleted" });
    expect(
      await db.submissionEvidence.findUnique({
        where: { id: replacement.evidenceId! },
        select: { scanState: true },
      }),
    ).toEqual({ scanState: "clean" });
  });

  it("atomically erases a revision draft bound to its exact one-use grant", async () => {
    const user = await createUser("bound-grant");
    const sourceSubmissionId = await createSubmission({
      suffix: "bound-grant-source",
      userId: user.id,
      versioned: true,
      finalised: true,
    });
    const grantId = "dpdp-pg-bound-grant";
    await db.resubmissionGrant.create({
      data: {
        id: grantId,
        assignmentId: VERSIONED_ASSIGNMENT_ID,
        assessmentVersionId: ASSESSMENT_VERSION_ID,
        ownerKind: "individual",
        ownerId: user.id,
        kind: "improvement",
        targetVersion: 2,
        targetAttempt: 1,
        trigger: "dpdp-pg-fixture",
        expiresAt: new Date("2026-08-10T00:00:00.000Z"),
        sourceSubmissionId,
      },
    });
    const revisionId = await createSubmission({
      suffix: "bound-grant-revision",
      userId: user.id,
      versioned: true,
      version: 2,
      attempt: 1,
      resubmissionGrantId: grantId,
    });

    const result = await eraseDpdpUser(
      { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion: vi.fn(async () => ({ verified: true })) },
    );

    expect(result.deleted).toMatchObject({ submissions: 2, resubmissionGrants: 1, user: 1 });
    expect(await db.submission.findUnique({ where: { id: revisionId } })).toBeNull();
    expect(await db.resubmissionGrant.findUnique({ where: { id: grantId } })).toBeNull();
  });

  it("deletes the interview video and the student's uploaded prerequisites", async () => {
    // A resume is PII and prerequisites are user-scoped, so nothing in the
    // submission or interview graph walks to them: without explicit coverage
    // erasure would drop the row and leave the file in S3.
    const user = await db.user.create({
      data: {
        id: "dpdp-pg-prereq-user",
        email: "prereq@example.com",
        name: "Prereq Student",
        role: "student",
        sectionId: SECTION_ID,
      },
    });
    const interview = await db.interview.create({
      data: { id: "dpdp-pg-video-interview", userId: user.id },
    });
    const videoKey = "interviews/dpdp-pg-video-interview/room-v.mp4";
    const videoVersion = "video-version-1";
    await db.interview.update({
      where: { id: interview.id },
      data: { videoS3Key: videoKey, videoS3VersionId: videoVersion },
    });
    const resumeKey = "interview-prerequisites/dpdp-pg-prereq-user/resume-a.pdf";
    await db.interviewPrerequisite.create({
      data: {
        userId: user.id,
        kind: "resume",
        s3Key: resumeKey,
        s3VersionId: "resume-version-1",
        contentType: "application/pdf",
        sizeBytes: 10,
      },
    });

    const deleted: string[] = [];
    await eraseDpdpUser(
      { userId: user.id, requestedBy: ADMIN, confirmEmail: user.email },
      {
        now: NOW,
        deleteObjectVersion: async (key: string) => {
          deleted.push(key);
          return true;
        },
      } as never,
    );

    expect(deleted).toContain(videoKey);
    expect(deleted).toContain(resumeKey);
    expect(await db.interviewPrerequisite.count({ where: { userId: user.id } })).toBe(0);
  });

  it("deletes exact generated previews and interview audio while ignoring policy markers", async () => {
    const user = await createUser("generated-exact");
    const previewSubmissionId = await createSubmission({
      suffix: "generated-exact-preview",
      userId: user.id,
    });
    const markerSubmissionId = await createSubmission({
      suffix: "generated-exact-marker",
      userId: user.id,
    });
    const decisionId = "dpdp-pg-generated-publication";
    const galleryId = "dpdp-pg-generated-gallery";
    const previewKey = "generated/dpdp-pg/preview.png";
    const previewVersion = "generated-preview-version";
    await createGeneratedReservation({
      id: "dpdp-pg-generated-preview-reservation",
      purpose: "publication_preview",
      submissionId: previewSubmissionId,
      targetId: decisionId,
      key: previewKey,
      versionId: previewVersion,
    });
    await db.publicationDecision.create({
      data: {
        id: decisionId,
        submissionId: previewSubmissionId,
        previewS3Key: previewKey,
        previewS3VersionId: previewVersion,
      },
    });
    await db.galleryItem.create({
      data: {
        id: galleryId,
        submissionId: previewSubmissionId,
        screenshotS3Key: previewKey,
        screenshotS3VersionId: previewVersion,
      },
    });
    await db.galleryItem.create({
      data: {
        id: "dpdp-pg-generated-marker-gallery",
        submissionId: markerSubmissionId,
        screenshotS3Key: "external-fingerprint:sha256:fixture",
      },
    });

    const interview = await db.interview.create({
      data: { id: "dpdp-pg-generated-interview", userId: user.id },
    });
    const interviewKey = "generated/dpdp-pg/interview.webm";
    const interviewVersion = "generated-interview-version";
    await createGeneratedReservation({
      id: "dpdp-pg-generated-interview-reservation",
      purpose: "interview_recording",
      interviewId: interview.id,
      targetId: interview.id,
      key: interviewKey,
      versionId: interviewVersion,
    });
    await db.interview.update({
      where: { id: interview.id },
      data: { audioS3Key: interviewKey, audioS3VersionId: interviewVersion },
    });
    const turn = await db.interviewTurn.create({
      data: {
        id: "dpdp-pg-generated-turn",
        interviewId: interview.id,
        turnNo: 1,
        speaker: "student",
        text: "Fixture",
        startedAt: NOW,
      },
    });
    const turnKey = "generated/dpdp-pg/turn.mp3";
    const turnVersion = "generated-turn-version";
    await createGeneratedReservation({
      id: "dpdp-pg-generated-turn-reservation",
      purpose: "interview_turn_audio",
      interviewId: interview.id,
      targetId: turn.id,
      key: turnKey,
      versionId: turnVersion,
    });
    await db.interviewTurn.update({
      where: { id: turn.id },
      data: { audioS3Key: turnKey, audioS3VersionId: turnVersion },
    });
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));

    const result = await eraseDpdpUser(
      { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion },
    );

    expect(deleteObjectVersion.mock.calls).toEqual(
      expect.arrayContaining([
        [previewKey, previewVersion],
        [interviewKey, interviewVersion],
        [turnKey, turnVersion],
      ]),
    );
    expect(deleteObjectVersion).toHaveBeenCalledTimes(3);
    expect(result.deleted).toMatchObject({
      generatedObjectReservations: 3,
      galleryItems: 2,
      publicationDecisions: 1,
      interviewTurns: 1,
      interviews: 1,
      submissions: 2,
      user: 1,
    });
  });

  it("requires a completed zero-version proof for an abandoned generated reservation", async () => {
    const user = await createUser("generated-absent-proof");
    const submissionId = await createSubmission({
      suffix: "generated-absent-proof",
      userId: user.id,
    });
    const reservationId = "dpdp-pg-generated-absent-reservation";
    const key = "generated/dpdp-pg/absent.png";
    await createGeneratedReservation({
      id: reservationId,
      purpose: "gallery_screenshot",
      submissionId,
      targetId: "dpdp-pg-generated-absent-gallery",
      key,
      expiresAt: new Date("2026-07-30T10:00:00.000Z"),
    });
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));

    await expect(
      eraseDpdpUser(
        { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
        { db, deleteObjectVersion },
      ),
    ).rejects.toMatchObject({ code: "object-version-missing" });

    const retention = await import("../worker/jobs/retention-cleanup");
    const cleanup = await retention.handleRetentionCleanup({
      now: NOW,
      requestedBy: "retention-worker",
      deps: retention.createProductionEvidenceRetentionDeps({
        persistence: retention.prismaRetentionPersistence(db),
        objects: {
          listObjectVersionIds: vi.fn(async () => []),
          deleteObjectVersion,
        },
      }),
    });
    expect(cleanup).toMatchObject({ deleted: 1, failed: [] });
    expect(deleteObjectVersion).not.toHaveBeenCalled();

    await expect(
      eraseDpdpUser(
        { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
        { db, deleteObjectVersion },
      ),
    ).resolves.toMatchObject({
      deleted: { generatedObjectReservations: 1, submissions: 1, user: 1 },
    });
  });

  it("gives one executor exclusive ownership of a generated-object deletion", async () => {
    const retentionFirstUser = await createUser("generated-retention-first");
    const retentionFirstSubmission = await createSubmission({
      suffix: "generated-retention-first",
      userId: retentionFirstUser.id,
    });
    const retentionFirstId = "dpdp-pg-generated-retention-first";
    const retentionFirstKey = "generated/dpdp-pg/retention-first.png";
    const retentionFirstVersion = "generated-retention-first-version";
    await createGeneratedReservation({
      id: retentionFirstId,
      purpose: "gallery_screenshot",
      submissionId: retentionFirstSubmission,
      targetId: "dpdp-pg-generated-retention-first-gallery",
      key: retentionFirstKey,
      versionId: retentionFirstVersion,
      consume: false,
    });
    const persistence = prismaRetentionPersistence(db);
    const retentionFirstIntent = {
      idempotencyKey: `retention:uncommitted-generated-object:${retentionFirstId}:${retentionFirstVersion}`,
      retentionPolicyId: null,
      targetType: "uncommitted-generated-object",
      targetId: retentionFirstId,
      expiresAt: NOW,
      s3Key: retentionFirstKey,
      s3VersionId: retentionFirstVersion,
      databaseAction: "mark-cancelled" as const,
    };
    await expect(persistence.prepareDeletion(retentionFirstIntent)).resolves.toBe("ready");
    await expect(
      eraseDpdpUser(
        {
          userId: retentionFirstUser.id,
          confirmEmail: retentionFirstUser.email,
          requestedBy: ADMIN,
          now: NOW,
        },
        { db, deleteObjectVersion: vi.fn(async () => ({ verified: true })) },
      ),
    ).rejects.toMatchObject({ code: "erasure-state-conflict" });

    const dpdpFirstUser = await createUser("generated-dpdp-first");
    const dpdpFirstSubmission = await createSubmission({
      suffix: "generated-dpdp-first",
      userId: dpdpFirstUser.id,
    });
    const dpdpFirstId = "dpdp-pg-generated-dpdp-first";
    const dpdpFirstKey = "generated/dpdp-pg/dpdp-first.png";
    const dpdpFirstVersion = "generated-dpdp-first-version";
    await createGeneratedReservation({
      id: dpdpFirstId,
      purpose: "gallery_screenshot",
      submissionId: dpdpFirstSubmission,
      targetId: "dpdp-pg-generated-dpdp-first-gallery",
      key: dpdpFirstKey,
      versionId: dpdpFirstVersion,
      consume: false,
    });
    let enteredDelete!: () => void;
    let releaseDelete!: () => void;
    const deleteStarted = new Promise<void>((resolve) => {
      enteredDelete = resolve;
    });
    const mayDelete = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const erasure = eraseDpdpUser(
      {
        userId: dpdpFirstUser.id,
        confirmEmail: dpdpFirstUser.email,
        requestedBy: ADMIN,
        now: NOW,
      },
      {
        db,
        deleteObjectVersion: vi.fn(async () => {
          enteredDelete();
          await mayDelete;
          return { verified: true };
        }),
      },
    );
    await deleteStarted;
    await expect(
      persistence.prepareDeletion({
        ...retentionFirstIntent,
        idempotencyKey: `retention:uncommitted-generated-object:${dpdpFirstId}:${dpdpFirstVersion}`,
        targetId: dpdpFirstId,
        s3Key: dpdpFirstKey,
        s3VersionId: dpdpFirstVersion,
      }),
    ).resolves.toBe("held");
    releaseDelete();
    await expect(erasure).resolves.toMatchObject({ deleted: { user: 1 } });
  });

  it("write-fences the learner graph and same-team survivor while S3 deletion is paused", async () => {
    const teamId = await createTeam("write-fence");
    const target = await createUser("write-fence-target", teamId);
    const survivor = await createUser("write-fence-survivor", teamId);
    const individualSubmissionId = await createSubmission({
      suffix: "write-fence-individual",
      userId: target.id,
    });
    const teamSubmissionId = await createSubmission({
      suffix: "write-fence-team",
      userId: target.id,
      teamId,
    });
    const teammateOwnedDraftId = await createSubmission({
      suffix: "write-fence-teammate-owned",
      userId: survivor.id,
      teamId,
    });
    const reservationId = "dpdp-pg-write-fence-generated";
    const key = "generated/dpdp-pg/write-fence.png";
    const versionId = "generated-write-fence-version";
    await createGeneratedReservation({
      id: reservationId,
      purpose: "gallery_screenshot",
      submissionId: individualSubmissionId,
      targetId: "dpdp-pg-write-fence-gallery",
      key,
      versionId,
      consume: false,
    });
    let enteredDelete!: () => void;
    let releaseDelete!: () => void;
    const deleteStarted = new Promise<void>((resolve) => {
      enteredDelete = resolve;
    });
    const mayDelete = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const erasure = eraseDpdpUser(
      { userId: target.id, confirmEmail: target.email, requestedBy: ADMIN, now: NOW },
      {
        db,
        deleteObjectVersion: vi.fn(async () => {
          enteredDelete();
          await mayDelete;
          return { verified: true };
        }),
      },
    );
    await deleteStarted;

    expect(
      await db.user.findUnique({
        where: { id: target.id },
        select: { flaggedForDeletion: true },
      }),
    ).toEqual({ flaggedForDeletion: true });
    expect(
      await db.deletionReceipt.findFirst({
        where: {
          targetType: "dpdp-user",
          targetId: target.id,
          databaseVerifiedAt: null,
        },
      }),
    ).not.toBeNull();

    await expect(
      createSubmission({ suffix: "write-fence-late", userId: target.id }),
    ).rejects.toThrow(/write-fenced/i);
    await expect(
      db.submission.update({
        where: { id: teamSubmissionId },
        data: { fields: { title: "Late mutation" } },
      }),
    ).rejects.toThrow(/write-fenced/i);
    await expect(
      db.user.update({
        where: { id: target.id },
        data: { email: "late-write@example.test" },
      }),
    ).rejects.toThrow(/write-fenced/i);
    await expect(
      db.uploadReservation.create({
        data: {
          id: "dpdp-pg-write-fence-late-upload",
          submissionId: teammateOwnedDraftId,
          assignmentId: ASSIGNMENT_ID,
          ownerKind: "team",
          ownerId: teamId,
          createdById: target.id,
          fieldKey: "artifact",
          fileRole: "artifactFile",
          filename: "late.json",
          s3Key: "submissions/dpdp-pg/write-fence/late.json",
          declaredContentType: "application/json",
          declaredBytes: 16,
          expiresAt: new Date("2026-08-01T12:00:00.000Z"),
        },
      }),
    ).rejects.toThrow(/write-fenced/i);
    await expect(
      db.interview.create({
        data: { id: "dpdp-pg-write-fence-late-interview", userId: target.id },
      }),
    ).rejects.toThrow(/write-fenced/i);
    await expect(
      eraseDpdpUser(
        {
          userId: survivor.id,
          confirmEmail: survivor.email,
          requestedBy: ADMIN,
          now: NOW,
        },
        { db, deleteObjectVersion: vi.fn(async () => ({ verified: true })) },
      ),
    ).rejects.toMatchObject({ code: "erasure-state-conflict" });

    releaseDelete();
    await expect(erasure).resolves.toMatchObject({
      deleted: { generatedObjectReservations: 1, reassignedTeamSubmissions: 1, user: 1 },
    });
    expect(
      await db.submission.findUnique({
        where: { id: teamSubmissionId },
        select: { userId: true },
      }),
    ).toEqual({ userId: survivor.id });
  });

  it("blocks both native exact-object hold target types before any S3 or DB change", async () => {
    const user = await createUser("native-holds");
    const key = "submissions/dpdp-pg/native-holds/artifact.json";
    const submissionId = await createSubmission({
      suffix: "native-holds",
      userId: user.id,
      files: [key],
    });
    const object = await attachEvidence({
      suffix: "native-holds",
      submissionId,
      userId: user.id,
      key,
      versionId: "version-native-holds",
    });
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));

    const evidenceHold = await db.retentionHold.create({
      data: {
        targetType: "submission-evidence-quarantined",
        targetId: object.evidenceId!,
        reason: "investigation",
        createdBy: ADMIN,
      },
    });
    await expect(
      eraseDpdpUser(
        { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
        { db, deleteObjectVersion },
      ),
    ).rejects.toMatchObject({ code: "retention-hold-active" });
    await db.retentionHold.update({
      where: { id: evidenceHold.id },
      data: { releasedAt: NOW, releasedBy: ADMIN },
    });

    await db.retentionHold.create({
      data: {
        targetType: "uncommitted-upload",
        targetId: object.reservationId,
        reason: "investigation",
        createdBy: ADMIN,
      },
    });
    await expect(
      eraseDpdpUser(
        { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
        { db, deleteObjectVersion },
      ),
    ).rejects.toMatchObject({ code: "retention-hold-active" });

    expect(deleteObjectVersion).not.toHaveBeenCalled();
    expect(await db.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(await db.submission.findUnique({ where: { id: submissionId } })).not.toBeNull();
    expect(
      await db.deletionReceipt.count({ where: { targetType: "dpdp-user", targetId: user.id } }),
    ).toBe(0);
  });

  it("blocks an unproven missing VersionId, then retries one persisted exact version after S3 failure", async () => {
    const user = await createUser("missing-retry");
    const key = "submissions/dpdp-pg/missing-retry/artifact.json";
    const submissionId = await createSubmission({
      suffix: "missing-retry",
      userId: user.id,
      files: [key],
    });
    const object = await attachEvidence({
      suffix: "missing-retry",
      submissionId,
      userId: user.id,
      key,
      versionId: null,
    });
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));

    await expect(
      eraseDpdpUser(
        { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
        { db, deleteObjectVersion },
      ),
    ).rejects.toMatchObject({ code: "object-version-missing" });
    expect(deleteObjectVersion).not.toHaveBeenCalled();
    expect(
      await db.deletionReceipt.count({ where: { targetType: "dpdp-user", targetId: user.id } }),
    ).toBe(0);

    await db.uploadReservation.update({
      where: { id: object.reservationId },
      data: { s3VersionId: "version-missing-retry" },
    });
    let attempts = 0;
    deleteObjectVersion.mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("S3 unavailable");
      return { verified: true, providerReceipt: "provider-retry" };
    });

    await expect(
      eraseDpdpUser(
        { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
        { db, deleteObjectVersion },
      ),
    ).rejects.toMatchObject({ code: "object-delete-failed" });
    expect(await db.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(
      await db.deletionReceipt.count({ where: { targetType: "dpdp-s3-object" } }),
    ).toBeGreaterThan(0);

    const result = await eraseDpdpUser(
      { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion },
    );
    expect(result.deleted.user).toBe(1);
    expect(deleteObjectVersion).toHaveBeenNthCalledWith(1, key, "version-missing-retry");
    expect(deleteObjectVersion).toHaveBeenNthCalledWith(2, key, "version-missing-retry");
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it("deduplicates one exact version shared across key-only submission references", async () => {
    const user = await createUser("shared-version");
    const key = "submissions/dpdp-pg/shared-version/artifact.json";
    const firstSubmissionId = await createSubmission({
      suffix: "shared-version-a",
      userId: user.id,
      files: [key],
    });
    const evidenceSubmissionId = await createSubmission({
      suffix: "shared-version-z",
      userId: user.id,
      files: [key],
    });
    await attachEvidence({
      suffix: "shared-version",
      submissionId: evidenceSubmissionId,
      userId: user.id,
      key,
      versionId: "version-shared",
    });
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));

    const result = await eraseDpdpUser(
      { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion },
    );

    expect(result.deleted.submissions).toBe(2);
    expect(deleteObjectVersion).toHaveBeenCalledOnce();
    expect(deleteObjectVersion).toHaveBeenCalledWith(key, "version-shared");
    expect(
      await db.submission.count({
        where: { id: { in: [firstSubmissionId, evidenceSubmissionId] } },
      }),
    ).toBe(0);
  });

  it("accepts a completed zero-version proof and deletes only its row without S3", async () => {
    const user = await createUser("verified-absent");
    const key = "submissions/dpdp-pg/verified-absent/artifact.json";
    const submissionId = await createSubmission({
      suffix: "verified-absent",
      userId: user.id,
      files: [key],
    });
    const object = await attachEvidence({
      suffix: "verified-absent",
      submissionId,
      userId: user.id,
      key,
      versionId: null,
      cancelledAt: NOW,
    });
    const proof = await db.deletionReceipt.create({
      data: {
        idempotencyKey: `retention:uncommitted-upload:${object.reservationId}:absent`,
        targetType: "uncommitted-upload",
        targetId: object.reservationId,
        s3Key: key,
        s3VersionId: null,
        databaseTable: "UploadReservation",
        databaseRecordId: object.reservationId,
        requestedBy: "retention-worker",
        deletedAt: NOW,
        s3VerifiedAt: null,
        databaseVerifiedAt: null,
        details: {
          phase: "intent",
          objectVersionCount: 0,
          databaseAction: "mark-cancelled",
          submissionId,
        },
      },
    });
    await db.deletionReceipt.update({
      where: { id: proof.id },
      data: {
        s3VerifiedAt: NOW,
        databaseVerifiedAt: NOW,
        details: {
          phase: "complete",
          objectVersionCount: 0,
          databaseAction: "mark-cancelled",
          submissionId,
        },
      },
    });
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));

    const result = await eraseDpdpUser(
      { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion },
    );

    expect(result.deleted.uploadReservations).toBe(1);
    expect(deleteObjectVersion).not.toHaveBeenCalled();
    expect(await db.deletionReceipt.findUnique({ where: { id: proof.id } })).not.toBeNull();
    const rowReceipt = await db.deletionReceipt.findFirst({
      where: {
        targetType: "dpdp-database-row",
        databaseTable: "UploadReservation",
        databaseRecordId: object.reservationId,
      },
    });
    expect(rowReceipt?.databaseVerifiedAt).not.toBeNull();
    expect(rowReceipt?.details).toMatchObject({
      phase: "complete",
      proofReceiptId: proof.id,
    });
  });

  it("cleans the individual versioned graph and reassigns team content unchanged", async () => {
    const teamId = await createTeam("success");
    const target = await createUser("success-target", teamId);
    const survivor = await createUser("success-survivor", teamId);
    const key = "submissions/dpdp-pg/success/artifact.json";
    const individualId = await createSubmission({
      suffix: "success-individual",
      userId: target.id,
      files: [key],
      versioned: true,
    });
    const teamSubmissionId = await createSubmission({
      suffix: "success-team",
      userId: target.id,
      teamId,
      finalised: true,
    });
    const teammateOwnedSubmissionId = await createSubmission({
      suffix: "success-teammate-owned",
      userId: survivor.id,
      teamId,
      finalised: true,
    });
    const teammateOwnedDraftId = await createSubmission({
      suffix: "success-teammate-owned-draft",
      userId: survivor.id,
      teamId,
    });
    await attachEvidence({
      suffix: "success",
      submissionId: individualId,
      userId: target.id,
      key,
      versionId: "version-success",
    });
    await finaliseSubmission(individualId);
    const grade = await db.grade.create({
      data: {
        id: "dpdp-pg-grade-success-individual",
        submissionId: individualId,
        rubricScores: { correctness: 4 },
        total: 4,
        confidence: 0.9,
        feedbackMd: "Good",
        flags: [],
        gradedBy: "fixture",
      },
    });
    const teamGrade = await db.grade.create({
      data: {
        id: "dpdp-pg-grade-success-team",
        submissionId: teamSubmissionId,
        rubricScores: { correctness: 5 },
        total: 5,
        confidence: 0.95,
        feedbackMd: "Shared",
        flags: [],
        gradedBy: "fixture",
      },
    });
    const teammateOwnedGrade = await db.grade.create({
      data: {
        id: "dpdp-pg-grade-success-teammate-owned",
        submissionId: teammateOwnedSubmissionId,
        rubricScores: { correctness: 5 },
        total: 5,
        confidence: 0.95,
        feedbackMd: "Shared teammate-owned record",
        flags: [],
        gradedBy: "fixture",
      },
    });
    const teammateOwnedHold = await db.gradeHold.create({
      data: {
        id: "dpdp-pg-hold-success-teammate-owned",
        submissionId: teammateOwnedSubmissionId,
        gradeId: teammateOwnedGrade.id,
        kind: "appeal",
        code: "teammate-owned-attribution",
        reason: "Preserve this academic hold",
        createdBy: target.id,
      },
    });
    const teammateOwnedAppeal = await db.gradeAppeal.create({
      data: {
        id: "dpdp-pg-appeal-success-teammate-owned",
        gradeId: teammateOwnedGrade.id,
        openedBy: target.id,
        reason: "Preserve this academic appeal",
        holdId: teammateOwnedHold.id,
      },
    });
    const teammateOwnedPublication = await db.publicationDecision.create({
      data: {
        id: "dpdp-pg-publication-success-teammate-owned",
        submissionId: teammateOwnedSubmissionId,
        ownerConsent: true,
        ownerConsentBy: target.id,
        ownerConsentAt: NOW,
      },
    });
    const teammateOwnedUpload = await db.uploadReservation.create({
      data: {
        id: "dpdp-pg-upload-success-teammate-owned",
        submissionId: teammateOwnedDraftId,
        assignmentId: ASSIGNMENT_ID,
        assessmentVersionId: null,
        ownerKind: "team",
        ownerId: teamId,
        createdById: target.id,
        fieldKey: "artifact",
        fileRole: "artifactFile",
        filename: "teammate-owned.json",
        s3Key: "submissions/dpdp-pg/success/teammate-owned.json",
        declaredContentType: "application/json",
        declaredBytes: 16,
        expiresAt: new Date("2026-08-01T12:00:00.000Z"),
      },
    });
    const resultRow = await db.assessmentResult.create({
      data: {
        id: "dpdp-pg-result-success",
        evaluationKey: "dpdp-pg-evaluation-success",
        submissionId: individualId,
        ownerKind: "individual",
        ownerId: target.id,
        version: 1,
        purpose: "graded",
        status: "completed",
        completedAt: NOW,
      },
    });
    const gradeHold = await db.gradeHold.create({
      data: {
        id: "dpdp-pg-grade-hold-success",
        submissionId: individualId,
        gradeId: grade.id,
        assessmentResultId: resultRow.id,
        kind: "appeal",
        code: "fixture",
        reason: "Fixture",
        status: "open",
        createdBy: target.id,
      },
    });
    await db.gradeAppeal.create({
      data: {
        id: "dpdp-pg-appeal-success",
        gradeId: grade.id,
        openedBy: target.id,
        reason: "Please review",
        holdId: gradeHold.id,
      },
    });
    await db.publicationDecision.create({
      data: { id: "dpdp-pg-publication-success", submissionId: individualId },
    });
    await db.galleryItem.create({
      data: { id: "dpdp-pg-gallery-success", submissionId: individualId },
    });
    await db.vote.create({
      data: {
        id: "dpdp-pg-vote-success",
        submissionId: teamSubmissionId,
        voterId: target.id,
      },
    });
    await db.notification.create({
      data: {
        id: "dpdp-pg-notification-success",
        userId: target.id,
        kind: "fixture",
        title: "Fixture",
      },
    });
    await db.portfolioEntry.create({
      data: {
        id: "dpdp-pg-portfolio-success",
        userId: target.id,
        links: [],
        validations: [],
      },
    });
    await db.gateException.create({
      data: {
        id: "dpdp-pg-gate-success",
        targetType: "assignment",
        targetId: ASSIGNMENT_ID,
        sectionId: SECTION_ID,
        userId: target.id,
        grantedBy: ADMIN,
      },
    });
    await db.quizAttempt.create({
      data: {
        id: "dpdp-pg-quiz-attempt-success",
        quizId: QUIZ_ID,
        userId: target.id,
        answers: [],
        scorePct: 0,
      },
    });
    const interview = await db.interview.create({
      data: { id: "dpdp-pg-interview-success", userId: target.id },
    });
    await db.interviewTurn.create({
      data: {
        id: "dpdp-pg-turn-success",
        interviewId: interview.id,
        turnNo: 1,
        speaker: "student",
        text: "Fixture",
        startedAt: NOW,
      },
    });
    await db.peerReview.create({
      data: {
        id: "dpdp-pg-peer-review-success",
        checkpoint: 99,
        reviewerId: target.id,
        revieweeId: survivor.id,
        pointsAllocated: 100,
        ratings: {},
      },
    });
    const nomination = await db.teamWorkflowNomination.create({
      data: {
        id: "dpdp-pg-nomination-success",
        teamId,
        assignmentId: ASSIGNMENT_ID,
        submissionId: teamSubmissionId,
        nominatedBy: target.id,
        reason: "Preserve this team-owned academic decision",
      },
    });
    const teammateOwnedNomination = await db.teamWorkflowNomination.create({
      data: {
        id: "dpdp-pg-nomination-success-teammate-owned",
        teamId,
        assignmentId: ASSIGNMENT_ID,
        submissionId: teammateOwnedSubmissionId,
        nominatedBy: target.id,
        reason: "Preserve teammate-owned nomination attribution",
      },
    });
    const identityAudit = await db.auditLog.create({
      data: {
        id: "dpdp-pg-audit-success-identity",
        actorId: target.id,
        action: "fixture.identity",
        targetType: "user",
        targetId: target.id,
        before: {
          nested: [
            target.id,
            `actor=${target.id}; email=${target.email}`,
            { [target.id]: target.clerkUserId },
          ],
        },
        after: {
          email: target.email,
          name: target.name,
          avatar: target.avatarUrl,
        },
      },
    });
    const embeddedNameAudit = await db.auditLog.create({
      data: {
        id: "dpdp-pg-audit-success-embedded-name",
        actorId: ADMIN,
        action: "fixture.embedded-name",
        targetType: "fixture",
        targetId: "fixture",
        before: {
          profile: { displayName: target.name },
        },
      },
    });
    const scalarAliasAudit = await db.auditLog.create({
      data: {
        id: "dpdp-pg-audit-success-scalar-alias",
        actorId: target.email,
        action: "fixture.scalar-alias",
        targetType: "fixture",
        targetId: target.clerkUserId,
        after: { avatarUrl: target.avatarUrl },
      },
    });

    const teamBefore = await db.submission.findUniqueOrThrow({
      where: { id: teamSubmissionId },
      select: {
        assignmentId: true,
        teamId: true,
        ownerKind: true,
        ownerId: true,
        status: true,
        fields: true,
        files: true,
        version: true,
        attempt: true,
        assessmentVersionId: true,
        contentHash: true,
      },
    });
    const deleteObjectVersion = vi.fn(async () => ({
      verified: true,
      providerReceipt: "provider-success",
    }));

    const erased = await eraseDpdpUser(
      { userId: target.id, confirmEmail: target.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion },
    );

    expect(deleteObjectVersion).toHaveBeenCalledOnce();
    expect(deleteObjectVersion).toHaveBeenCalledWith(key, "version-success");
    expect(await db.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await db.submission.findUnique({ where: { id: individualId } })).toBeNull();
    const teamAfter = await db.submission.findUniqueOrThrow({
      where: { id: teamSubmissionId },
      select: {
        userId: true,
        assignmentId: true,
        teamId: true,
        ownerKind: true,
        ownerId: true,
        status: true,
        fields: true,
        files: true,
        version: true,
        attempt: true,
        assessmentVersionId: true,
        contentHash: true,
      },
    });
    const { userId: reassignedUserId, ...teamAfterInvariant } = teamAfter;
    expect(reassignedUserId).toBe(survivor.id);
    expect(teamAfterInvariant).toEqual(teamBefore);
    expect(await db.grade.findUnique({ where: { id: teamGrade.id } })).not.toBeNull();
    expect(await db.grade.findUnique({ where: { id: grade.id } })).toBeNull();
    const completedReceipt = await db.deletionReceipt.findUniqueOrThrow({
      where: { id: erased.receiptId },
      select: { details: true },
    });
    const actorPseudonym = (completedReceipt.details as Record<string, unknown>)
      .actorPseudonym;
    expect(actorPseudonym).toMatch(/^dpdp-erased-actor:v1:[0-9a-f]{64}$/);
    const expectedActor = actorPseudonym as string;
    expect(
      await db.uploadReservation.findUnique({ where: { id: teammateOwnedUpload.id } }),
    ).toMatchObject({ createdById: expectedActor });
    expect(
      await db.gradeAppeal.findUnique({ where: { id: teammateOwnedAppeal.id } }),
    ).toMatchObject({ openedBy: expectedActor });
    expect(
      await db.gradeHold.findUnique({ where: { id: teammateOwnedHold.id } }),
    ).toMatchObject({ createdBy: expectedActor });
    expect(
      await db.publicationDecision.findUnique({ where: { id: teammateOwnedPublication.id } }),
    ).toMatchObject({ ownerConsentBy: expectedActor });
    expect(
      await db.teamWorkflowNomination.findUnique({
        where: { id: teammateOwnedNomination.id },
      }),
    ).toMatchObject({ nominatedBy: expectedActor });
    const scrubbedAudit = await db.auditLog.findUniqueOrThrow({
      where: { id: identityAudit.id },
    });
    expect(scrubbedAudit).toMatchObject({
      actorId: expectedActor,
      targetId: expectedActor,
    });
    expect(
      await db.auditLog.findUniqueOrThrow({ where: { id: scalarAliasAudit.id } }),
    ).toMatchObject({
      actorId: expectedActor,
      targetId: expectedActor,
      after: { avatarUrl: expectedActor },
    });
    const scrubbedAuditJson = JSON.stringify(scrubbedAudit);
    for (const rawIdentity of [
      target.id,
      target.email,
      target.clerkUserId,
      target.name,
      target.avatarUrl,
    ]) {
      expect(scrubbedAuditJson).not.toContain(rawIdentity);
    }
    expect(
      JSON.stringify(
        await db.auditLog.findUniqueOrThrow({ where: { id: embeddedNameAudit.id } }),
      ),
    ).not.toContain(target.name);
    const completedDetails = JSON.stringify(completedReceipt.details);
    for (const rawIdentity of [
      target.email,
      target.clerkUserId,
      target.name,
      target.avatarUrl,
    ]) {
      expect(completedDetails).not.toContain(rawIdentity);
    }
    await expect(
      db.teamWorkflowNomination.update({
        where: { id: nomination.id },
        data: { status: "accepted", reviewedBy: ADMIN, reviewedAt: NOW },
      }),
    ).resolves.toMatchObject({
      nominatedBy: expectedActor,
      status: "accepted",
      reviewedBy: ADMIN,
    });
    expect(erased.deleted).toMatchObject({
      appeals: 1,
      gradeHolds: 1,
      assessmentResults: 1,
      evidence: 1,
      uploadReservations: 1,
      submissions: 1,
      reassignedTeamSubmissions: 1,
      user: 1,
    });
    expect(
      await db.deletionReceipt.count({
        where: { targetType: "dpdp-database-row", databaseTable: "Submission" },
      }),
    ).toBeGreaterThanOrEqual(2);
    expect(
      await db.auditLog.findFirst({
        where: { action: "dpdp-delete", targetId: expectedActor },
      }),
    ).not.toBeNull();
    expect(JSON.stringify(await db.auditLog.findMany())).not.toContain(target.id);

    await expect(
      db.auditLog.create({
        data: {
          actorId: ADMIN,
          action: "fixture.late-raw-identity",
          targetType: "fixture",
          targetId: "fixture",
          after: { nested: { erasedActor: target.id } },
        },
      }),
    ).rejects.toThrow(/completed DPDP erasure/);
    for (const [identityKey, rawIdentity] of [
      ["email", target.email],
      ["clerkUserId", target.clerkUserId],
      ["avatarUrl", target.avatarUrl],
      ["displayName", target.name],
    ] as const) {
      await expect(
        db.auditLog.create({
          data: {
            actorId: ADMIN,
            action: `fixture.late-${identityKey}`,
            targetType: "fixture",
            targetId: "fixture",
            after: { [identityKey]: rawIdentity },
          },
        }),
      ).rejects.toThrow(/completed DPDP erasure/);
    }
    await expect(
      db.auditLog.create({
        data: {
          actorId: target.email,
          action: "fixture.late-email-scalar",
          targetType: "fixture",
          targetId: "fixture",
        },
      }),
    ).rejects.toThrow(/completed DPDP erasure/);
    await expect(
      db.gradeHold.update({
        where: { id: teammateOwnedHold.id },
        data: { createdBy: survivor.id },
      }),
    ).rejects.toThrow(/pseudonyms are immutable/i);

    const repeated = await eraseDpdpUser(
      { userId: target.id, confirmEmail: target.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion },
    );
    expect(repeated.alreadyCompleted).toBe(true);
    expect(repeated.receiptId).toBe(erased.receiptId);
    expect(deleteObjectVersion).toHaveBeenCalledOnce();
  });

  it("deletes a team submission only when the erased user is its last member", async () => {
    const teamId = await createTeam("last-member");
    const target = await createUser("last-member", teamId);
    const key = "submissions/dpdp-pg/last-member/artifact.json";
    const submissionId = await createSubmission({
      suffix: "last-member",
      userId: target.id,
      teamId,
      files: [key],
    });
    await attachEvidence({
      suffix: "last-member",
      submissionId,
      userId: target.id,
      key,
      versionId: "version-last-member",
    });
    const deleteObjectVersion = vi.fn(async () => ({ verified: true }));

    const erased = await eraseDpdpUser(
      { userId: target.id, confirmEmail: target.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion },
    );

    expect(erased.deleted).toMatchObject({ submissions: 1, user: 1 });
    expect(deleteObjectVersion).toHaveBeenCalledWith(key, "version-last-member");
    expect(await db.submission.findUnique({ where: { id: submissionId } })).toBeNull();
    const child = await db.deletionReceipt.findFirst({
      where: {
        targetType: "dpdp-database-row",
        databaseTable: "Submission",
        databaseRecordId: submissionId,
      },
    });
    expect(child?.details).toMatchObject({
      phase: "complete",
      action: "delete",
      teamId,
      lastTeamMember: true,
    });
  });

  it("rejects missing, invalid, unrelated, or childless receipt GUC values", async () => {
    const user = await createUser("invalid-guc");
    const submissionId = await createSubmission({
      suffix: "invalid-guc",
      userId: user.id,
      versioned: true,
    });

    await expect(db.submission.delete({ where: { id: submissionId } })).rejects.toThrow();
    await expect(
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config(${DPDP_RECEIPT_GUC}, ${"not-a-receipt"}, true)`;
        await tx.submission.delete({ where: { id: submissionId } });
      }),
    ).rejects.toThrow();

    const unrelated = await db.deletionReceipt.create({
      data: {
        idempotencyKey: "dpdp:invalid-guc:unrelated",
        targetType: "dpdp-user",
        targetId: "some-other-user",
        requestedBy: ADMIN,
        deletedAt: NOW,
        s3VerifiedAt: null,
        details: {
          phase: "intent",
          confirmedEmail: "other@example.test",
          email: "other@example.test",
        },
      },
    });
    await db.deletionReceipt.update({
      where: { id: unrelated.id },
      data: {
        s3VerifiedAt: NOW,
        details: {
          phase: "database_cleanup",
          confirmedEmail: "other@example.test",
          email: "other@example.test",
        },
      },
    });
    await expect(
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config(${DPDP_RECEIPT_GUC}, ${unrelated.id}, true)`;
        await tx.submission.delete({ where: { id: submissionId } });
      }),
    ).rejects.toThrow();
    expect(await db.submission.findUnique({ where: { id: submissionId } })).not.toBeNull();
  });

  it("enforces legal AssessmentResult transitions and freezes terminal evidence", async () => {
    const user = await createUser("assessment-result-lifecycle");
    const submissionId = await createSubmission({
      suffix: "assessment-result-lifecycle",
      userId: user.id,
      versioned: true,
    });
    const result = await db.assessmentResult.create({
      data: {
        id: "dpdp-pg-assessment-result-lifecycle",
        evaluationKey: "dpdp-pg-assessment-result-lifecycle",
        submissionId,
        assessmentVersionId: ASSESSMENT_VERSION_ID,
        ownerKind: "individual",
        ownerId: user.id,
        version: 1,
        purpose: "graded",
      },
    });

    await expect(
      db.assessmentResult.update({
        where: { id: result.id },
        data: { status: "completed", completedAt: NOW },
      }),
    ).rejects.toThrow(/invalid status transition/i);
    await db.assessmentResult.update({
      where: { id: result.id },
      data: { status: "claimed", claimToken: "claim-1", claimedAt: NOW },
    });
    await db.assessmentResult.update({
      where: { id: result.id },
      data: {
        status: "deterministic_complete",
        deterministicResult: { total: 4 },
        assessmentHash: "assessment-hash",
        evaluatorHash: "evaluator-hash",
      },
    });
    await db.assessmentResult.update({
      where: { id: result.id },
      data: {
        status: "completed",
        completedAt: NOW,
        structuredFeedback: { summary: "Complete" },
      },
    });
    await expect(
      db.assessmentResult.update({
        where: { id: result.id },
        data: { structuredFeedback: { summary: "Rewritten" } },
      }),
    ).rejects.toThrow(/terminal AssessmentResult evidence is immutable/i);
    await expect(
      db.assessmentResult.update({
        where: { id: result.id },
        data: { scoreable: true, publishable: true },
      }),
    ).resolves.toMatchObject({ scoreable: true, publishable: true });
  });

  it("requires retention policies to be superseded by a new immutable row", async () => {
    const policy = await db.retentionPolicy.create({
      data: {
        id: "dpdp-pg-retention-policy-immutable",
        classKey: "dpdp-pg-retention-policy-immutable-v1",
        objectClass: "fixture",
        expiresAfterDays: 30,
        deletionAuthority: "fixture-admin",
        legalHoldBehavior: "block",
        s3CleanupRequired: true,
        databaseCleanupPolicy: "mark-deleted",
      },
    });

    await expect(
      db.retentionPolicy.update({
        where: { id: policy.id },
        data: { expiresAfterDays: 31 },
      }),
    ).rejects.toThrow(/create a versioned policy row instead/i);
    await expect(
      db.retentionPolicy.delete({ where: { id: policy.id } }),
    ).rejects.toThrow(/create a versioned policy row instead/i);
  });

  it("rejects submission and native object holds that race after durable intent", async () => {
    const user = await createUser("hold-race");
    const key = "submissions/dpdp-pg/hold-race/artifact.json";
    const submissionId = await createSubmission({
      suffix: "hold-race",
      userId: user.id,
      files: [key],
    });
    const object = await attachEvidence({
      suffix: "hold-race",
      submissionId,
      userId: user.id,
      key,
      versionId: "version-hold-race",
    });
    let enteredDelete!: () => void;
    let releaseDelete!: () => void;
    const deleteStarted = new Promise<void>((resolve) => {
      enteredDelete = resolve;
    });
    const mayDelete = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const erasure = eraseDpdpUser(
      { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
      {
        db,
        deleteObjectVersion: vi.fn(async () => {
          enteredDelete();
          await mayDelete;
          return { verified: true };
        }),
      },
    );
    await deleteStarted;

    await expect(
      db.retentionHold.create({
        data: {
          targetType: "submission",
          targetId: submissionId,
          reason: "late hold",
          createdBy: ADMIN,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.retentionHold.create({
        data: {
          targetType: "uncommitted-upload",
          targetId: object.reservationId,
          reason: "late native hold",
          createdBy: ADMIN,
        },
      }),
    ).rejects.toThrow();

    releaseDelete();
    await expect(erasure).resolves.toMatchObject({ deleted: { user: 1 } });
    expect(
      await db.retentionHold.count({
        where: {
          OR: [
            { targetType: "submission", targetId: submissionId },
            { targetType: "uncommitted-upload", targetId: object.reservationId },
          ],
        },
      }),
    ).toBe(0);
  });

  it("serializes a pre-intent AuditLog writer and scrubs it before completion", async () => {
    const user = await createUser("audit-barrier");
    let enteredWriter!: () => void;
    let releaseWriter!: () => void;
    const writerEntered = new Promise<void>((resolve) => {
      enteredWriter = resolve;
    });
    const writerMayCommit = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const writer = db.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          id: "dpdp-pg-audit-barrier-in-flight",
          actorId: ADMIN,
          action: "fixture.in-flight-identity",
          targetType: "fixture",
          targetId: "fixture",
          after: { email: user.email },
        },
      });
      enteredWriter();
      await writerMayCommit;
    });
    await writerEntered;

    const erasure = eraseDpdpUser(
      { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion: vi.fn(async () => ({ verified: true })) },
    );
    try {
      const earlyState = await Promise.race([
        erasure.then(() => "completed", () => "rejected"),
        new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 75)),
      ]);
      expect(earlyState).toBe("blocked");
    } finally {
      releaseWriter();
    }

    await writer;
    await expect(erasure).resolves.toMatchObject({ deleted: { user: 1 } });
    expect(
      JSON.stringify(
        await db.auditLog.findUniqueOrThrow({
          where: { id: "dpdp-pg-audit-barrier-in-flight" },
        }),
      ),
    ).not.toContain(user.email);
  });

  it("enforces same-submission hold and appeal bindings in both directions", async () => {
    const firstUser = await createUser("binding-first");
    const secondUser = await createUser("binding-second");
    const firstSubmission = await createSubmission({
      suffix: "binding-first",
      userId: firstUser.id,
    });
    const secondSubmission = await createSubmission({
      suffix: "binding-second",
      userId: secondUser.id,
    });
    const firstGrade = await db.grade.create({
      data: {
        id: "dpdp-pg-binding-grade-first",
        submissionId: firstSubmission,
        rubricScores: {},
        total: 1,
        confidence: 0.9,
        feedbackMd: "First",
        flags: [],
        gradedBy: "fixture",
      },
    });
    const secondGrade = await db.grade.create({
      data: {
        id: "dpdp-pg-binding-grade-second",
        submissionId: secondSubmission,
        rubricScores: {},
        total: 1,
        confidence: 0.9,
        feedbackMd: "Second",
        flags: [],
        gradedBy: "fixture",
      },
    });
    const firstResult = await db.assessmentResult.create({
      data: {
        id: "dpdp-pg-binding-result-first",
        evaluationKey: "dpdp-pg-binding-evaluation-first",
        submissionId: firstSubmission,
        version: 1,
        purpose: "graded",
      },
    });
    const secondResult = await db.assessmentResult.create({
      data: {
        id: "dpdp-pg-binding-result-second",
        evaluationKey: "dpdp-pg-binding-evaluation-second",
        submissionId: secondSubmission,
        version: 1,
        purpose: "graded",
      },
    });

    await expect(
      db.gradeHold.create({
        data: {
          submissionId: firstSubmission,
          gradeId: secondGrade.id,
          kind: "appeal",
          code: "cross-grade",
          reason: "Invalid",
          createdBy: firstUser.id,
        },
      }),
    ).rejects.toThrow(/same Submission/i);
    await expect(
      db.gradeHold.create({
        data: {
          submissionId: firstSubmission,
          gradeId: firstGrade.id,
          assessmentResultId: secondResult.id,
          kind: "appeal",
          code: "cross-result",
          reason: "Invalid",
          createdBy: firstUser.id,
        },
      }),
    ).rejects.toThrow(/same Submission/i);

    const hold = await db.gradeHold.create({
      data: {
        id: "dpdp-pg-binding-hold-first",
        submissionId: firstSubmission,
        gradeId: firstGrade.id,
        assessmentResultId: firstResult.id,
        kind: "appeal",
        code: "valid",
        reason: "Valid",
        createdBy: firstUser.id,
      },
    });
    await expect(
      db.gradeAppeal.create({
        data: {
          gradeId: secondGrade.id,
          holdId: hold.id,
          openedBy: secondUser.id,
          reason: "Cross-linked",
        },
      }),
    ).rejects.toThrow(/same Grade and Submission/i);
    await expect(
      db.grade.update({
        where: { id: firstGrade.id },
        data: { submissionId: secondSubmission },
      }),
    ).rejects.toThrow(/binding is immutable/i);
    await expect(
      db.gradeHold.update({
        where: { id: hold.id },
        data: { gradeId: secondGrade.id },
      }),
    ).rejects.toThrow(/binding is immutable/i);
  });

  it("does not confuse a common erased display name with unrelated audit state", async () => {
    const user = await createUser("common-display-name");
    await db.user.update({ where: { id: user.id }, data: { name: "Open" } });
    const erased = await eraseDpdpUser(
      { userId: user.id, confirmEmail: user.email, requestedBy: ADMIN, now: NOW },
      { db, deleteObjectVersion: vi.fn(async () => ({ verified: true })) },
    );

    await expect(
      db.auditLog.create({
        data: {
          actorId: ADMIN,
          action: "fixture.unrelated-open-status",
          targetType: "fixture",
          targetId: "fixture",
          after: { user: { status: "Open" } },
        },
      }),
    ).resolves.toBeTruthy();
    const receipt = await db.deletionReceipt.findUniqueOrThrow({
      where: { id: erased.receiptId },
      select: { details: true },
    });
    expect(JSON.stringify(receipt.details)).not.toContain('"Open"');
  });
});
