import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { resolveSelectedGradeHolds } from "../lib/review-queue";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

const runLive = process.env.RUN_REVIEW_QUEUE_PG_TESTS === "1";
const PREFIX = "review-hold-pg";
const SECTION_ID = `${PREFIX}-section`;
const USER_ID = `${PREFIX}-user`;
const ASSIGNMENT_TYPE_ID = `${PREFIX}-type`;
const ASSIGNMENT_ID = `${PREFIX}-assignment`;
const SUBMISSION_ID = `${PREFIX}-submission`;

describe.skipIf(!runLive)("bulk hold resolution against migrated PostgreSQL", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    db = new PrismaClient();
    await db.section.create({
      data: { id: SECTION_ID, code: "RH-PG", name: "Review hold PostgreSQL tests" },
    });
    await db.user.create({
      data: {
        id: USER_ID,
        email: `${PREFIX}@example.invalid`,
        name: "Review Hold Test",
        sectionId: SECTION_ID,
      },
    });
    await db.assignmentType.create({
      data: {
        id: ASSIGNMENT_TYPE_ID,
        slug: PREFIX,
        title: "Review hold fixture",
        description: "Disposable release-test fixture",
        submissionSchema: { fields: [] },
        rubric: { criteria: [] },
      },
    });
    await db.assignment.create({
      data: {
        id: ASSIGNMENT_ID,
        assignmentTypeId: ASSIGNMENT_TYPE_ID,
        title: "Review hold fixture",
        brief: "Disposable",
        sectionIds: [SECTION_ID],
      },
    });
    await db.submission.create({
      data: {
        id: SUBMISSION_ID,
        assignmentId: ASSIGNMENT_ID,
        userId: USER_ID,
        fields: {},
        files: [],
      },
    });
  });

  afterAll(async () => {
    await db?.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "review_hold_pg_reject_audit" ON "AuditLog"',
    );
    await db?.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS review_hold_pg_reject_audit()',
    );
    await db?.auditLog.deleteMany({ where: { actorId: USER_ID } });
    await db?.gradeHold.deleteMany({
      where: { submission: { id: { startsWith: PREFIX } } },
    });
    await db?.submission.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await db?.assignment.deleteMany({ where: { id: ASSIGNMENT_ID } });
    await db?.assignmentType.deleteMany({ where: { id: ASSIGNMENT_TYPE_ID } });
    await db?.user.deleteMany({ where: { id: USER_ID } });
    await db?.section.deleteMany({ where: { id: SECTION_ID } });
    await db?.$disconnect();
  });

  it("resolves and audits a 200-row selection in one atomic operation", async () => {
    await db.submission.createMany({
      data: Array.from({ length: 200 }, (_, index) => ({
        id: `${PREFIX}-bulk-submission-${index}`,
        assignmentId: ASSIGNMENT_ID,
        userId: USER_ID,
        fields: {},
        files: [],
      })),
    });
    await db.gradeHold.createMany({
      data: Array.from({ length: 200 }, (_, index) => ({
        id: `${PREFIX}-bulk-${index}`,
        submissionId: `${PREFIX}-bulk-submission-${index}`,
        kind: "flag" as const,
        code: "bulk-cause",
        reason: "Fixture",
        createdBy: USER_ID,
      })),
    });
    const rows = await db.gradeHold.findMany({
      where: { id: { startsWith: `${PREFIX}-bulk-` } },
      select: { id: true, updatedAt: true },
      orderBy: { id: "asc" },
    });

    const result = await resolveSelectedGradeHolds({
      cause: "flag:bulk-cause",
      selected: rows.map((row) => ({
        holdId: row.id,
        expectedUpdatedAt: row.updatedAt.toISOString(),
      })),
      actorId: USER_ID,
      reason: "Verified in the release integration suite",
      confirmed: true,
    });

    expect(result.resolved).toHaveLength(200);
    expect(result.failures).toEqual([]);
    expect(
      await db.gradeHold.count({
        where: { id: { startsWith: `${PREFIX}-bulk-` }, status: "resolved" },
      }),
    ).toBe(200);
    expect(
      await db.auditLog.count({
        where: { actorId: USER_ID, action: "grade.hold.resolve" },
      }),
    ).toBe(200);
  });

  it("rolls the hold update back when its audit insert fails", async () => {
    const hold = await db.gradeHold.create({
      data: {
        id: `${PREFIX}-rollback`,
        submissionId: SUBMISSION_ID,
        kind: "flag",
        code: "rollback-cause",
        reason: "Fixture",
        createdBy: USER_ID,
      },
      select: { id: true, updatedAt: true },
    });
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION review_hold_pg_reject_audit()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."action" = 'grade.hold.resolve'
          AND NEW."after"->>'holdId' = '${hold.id}' THEN
          RAISE EXCEPTION 'forced audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "review_hold_pg_reject_audit"
      BEFORE INSERT ON "AuditLog"
      FOR EACH ROW EXECUTE FUNCTION review_hold_pg_reject_audit();
    `);

    await expect(
      resolveSelectedGradeHolds({
        cause: "flag:rollback-cause",
        selected: [{ holdId: hold.id, expectedUpdatedAt: hold.updatedAt.toISOString() }],
        actorId: USER_ID,
        reason: "This audit is forced to fail",
        confirmed: true,
      }),
    ).rejects.toThrow(/forced audit failure/i);

    await db.$executeRawUnsafe(
      'DROP TRIGGER "review_hold_pg_reject_audit" ON "AuditLog"',
    );
    expect(await db.gradeHold.findUniqueOrThrow({ where: { id: hold.id } })).toMatchObject({
      status: "open",
      resolvedAt: null,
      resolvedBy: null,
    });
    expect(
      await db.auditLog.count({
        where: {
          actorId: USER_ID,
          action: "grade.hold.resolve",
          after: { path: ["holdId"], equals: hold.id },
        },
      }),
    ).toBe(0);
  });
});
