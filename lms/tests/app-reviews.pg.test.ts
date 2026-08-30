import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/db";
import { APP_REVIEW_ROUND_ID } from "../lib/app-reviews/policy";
import { appReviewOverview, assignAppReviews, getStudentAppReviews, importAppReviewEntries, replaceReportedAppReview, reportAppReviewIssue, setAppReviewGate, submitAppReview } from "../lib/app-reviews/service";
import type { SessionUser } from "../lib/auth";

const live = process.env.RUN_APP_REVIEW_PG_TESTS === "1";
const user = (i: number): SessionUser => ({ userId: `ar-u${i}`, email: `ar${i}@example.org`, role: "student", sectionId: "ar-A", teamId: null });
const feedback = { visual: 3, functionality: 4, overall: 3, comment: "I tested the main search flow and the results loaded correctly. The small navigation labels need better contrast on mobile screens." };

describe.skipIf(!live)("app reviews on an isolated migrated PostgreSQL", () => {
  let disposable = false;
  let initialGrades = 0, initialPeerReviews = 0;
  beforeAll(async () => {
    if (process.env.CONFIRM_DISPOSABLE_POSTGRES !== "1" || !process.env.DATABASE_URL || !/^postgres(?:ql)?:$/u.test(new URL(process.env.DATABASE_URL).protocol)) throw new Error("Explicit disposable PostgreSQL database required.");
    disposable = true;
    initialGrades = await prisma.grade.count(); initialPeerReviews = await prisma.peerReview.count();
    process.env.ENABLE_TEST_LOGIN = "1";
    await prisma.appReview.deleteMany({ where: { roundId: APP_REVIEW_ROUND_ID } });
    await prisma.appReviewEntry.deleteMany({ where: { roundId: APP_REVIEW_ROUND_ID } });
    await prisma.appReviewRound.deleteMany({ where: { id: APP_REVIEW_ROUND_ID } });
    await prisma.gate.deleteMany({ where: { targetType: "app_review", targetId: APP_REVIEW_ROUND_ID } });
    for (const code of ["AR-A", "AR-B"]) await prisma.section.upsert({ where: { id: code.replace("AR", "ar") }, update: { code }, create: { id: code.replace("AR", "ar"), code, name: `Test section ${code}` } });
    await prisma.user.createMany({ skipDuplicates: true, data: [...Array.from({ length: 9 }, (_, i) => ({ id: `ar-u${i}`, name: `PRIVATE CREATOR ${i}`, email: `ar${i}@example.org`, sectionId: "ar-A", role: "student" as const })),
      { id: "ar-other", name: "Other section", email: "other@example.org", sectionId: "ar-B", role: "student" },
      { id: "ar-admin", name: "Instructor", email: "admin@example.org", sectionId: "ar-A", role: "instructor" }] });
    await prisma.userEmailAlias.upsert({ where: { email: "alias@example.org" }, update: {}, create: { email: "alias@example.org", userId: "ar-u0" } });
    await prisma.assignmentType.upsert({ where: { id: "ar-type" }, update: { slug: "ar-app" }, create: { id: "ar-type", slug: "ar-app", title: "App", description: "fixture", submissionSchema: { fields: [] }, rubric: { criteria: [] } } });
    await prisma.assignment.upsert({ where: { id: "asg_s4_app" }, update: {}, create: { id: "asg_s4_app", assignmentTypeId: "ar-type", title: "App", brief: "fixture", sectionIds: ["ar-A", "ar-B"] } });
  });
  afterAll(async () => {
    if (disposable) {
      await prisma.appReview.deleteMany({ where: { roundId: APP_REVIEW_ROUND_ID } });
      await prisma.appReviewEntry.deleteMany({ where: { roundId: APP_REVIEW_ROUND_ID } });
      await prisma.appReviewRound.deleteMany({ where: { id: APP_REVIEW_ROUND_ID } });
      await prisma.gate.deleteMany({ where: { targetType: "app_review", targetId: APP_REVIEW_ROUND_ID } });
      await prisma.gateException.deleteMany({ where: { targetType: "app_review", targetId: APP_REVIEW_ROUND_ID } });
      await prisma.auditLog.deleteMany({ where: { actorId: "ar-admin" } });
      await prisma.assignment.deleteMany({ where: { id: "asg_s4_app", assignmentTypeId: "ar-type" } });
      await prisma.assignmentType.deleteMany({ where: { id: "ar-type" } });
      await prisma.user.deleteMany({ where: { id: { in: [...Array.from({ length: 9 }, (_, i) => `ar-u${i}`), "ar-other", "ar-admin"] } } });
      await prisma.section.deleteMany({ where: { id: { in: ["ar-A", "ar-B"] } } });
    }
    await prisma.$disconnect();
  });
  it("validates imports atomically, resolves aliases, and preserves immutable snapshots on retry", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ email: i === 0 ? "alias@example.org" : user(i).email, section: "Section AR-A", appUrl: `https://fixture${i}.lovable.app/`, sourceRef: `sheet:record-${i + 2}` }));
    const invalid = await importAppReviewEntries([...rows, { ...rows[0], email: "missing@example.org" }], "ar-admin", true);
    expect(invalid.applied).toBe(false);
    expect(await prisma.appReviewEntry.count()).toBe(0);
    expect((await importAppReviewEntries(rows, "ar-admin", false)).added).toBe(8);
    expect(await prisma.appReviewEntry.count()).toBe(0);
    expect((await importAppReviewEntries(rows, "ar-admin", true)).applied).toBe(true);
    expect((await importAppReviewEntries(rows, "ar-admin", true)).unchanged).toBe(8);
    expect((await importAppReviewEntries([{ ...rows[0], appUrl: "https://changed.lovable.app/" }], "ar-admin", true)).applied).toBe(false);
  });
  it("fails closed and refuses a section without enough apps", async () => {
    await expect(assignAppReviews(user(0))).rejects.toThrow("not open");
    await expect(setAppReviewGate("ar-B", "open", "ar-admin")).rejects.toThrow("five distinct");
    await setAppReviewGate("ar-A", "open", "ar-admin");
  });
  it("concurrent starts yield the same five targets, hide identities, and allow non-submitters", async () => {
    const [first, second] = await Promise.all([assignAppReviews(user(0)), assignAppReviews(user(0))]);
    expect(first.reviews).toHaveLength(5);
    expect(second.reviews.map((row) => row.id)).toEqual(first.reviews.map((row) => row.id));
    expect(new Set(first.reviews.map((row) => row.appUrl)).size).toBe(5);
    expect(first.reviews.map((row) => row.appUrl)).not.toContain("https://fixture0.lovable.app/");
    for (const secret of ["PRIVATE CREATOR", "example.org", "authorId", "entryId", "sourceRef"]) expect(JSON.stringify(first)).not.toContain(secret);
    expect((await assignAppReviews(user(8))).reviews).toHaveLength(5);
    expect(await prisma.appReview.count({ where: { reviewerId: user(0).userId, retiredAt: null } })).toBe(5);
  });
  it("rejects short comments, foreign reviews, roles, and cross-section reads", async () => {
    const target = (await getStudentAppReviews(user(0))).reviews[0];
    await expect(submitAppReview(user(0), target.id, { ...feedback, comment: "too short" })).rejects.toThrow("20 words");
    await expect(submitAppReview(user(1), target.id, feedback)).rejects.toThrow("not found");
    await expect(getStudentAppReviews({ ...user(0), role: "instructor" })).rejects.toThrow("student account");
    expect((await getStudentAppReviews({ ...user(0), sectionId: "ar-B" })).reviews).toEqual([]);
    const ownEntry = await prisma.appReviewEntry.findFirstOrThrow({ where: { authorId: user(0).userId } });
    await expect(prisma.appReview.create({ data: { roundId: APP_REVIEW_ROUND_ID, entryId: ownEntry.id, reviewerId: user(0).userId, slot: 1 } })).rejects.toThrow();
  });
  it("persists access reports without completion and retains them after instructor replacement", async () => {
    const original = (await getStudentAppReviews(user(0))).reviews[0];
    await reportAppReviewIssue(user(0), original.id, feedback.comment);
    expect((await getStudentAppReviews(user(0))).completed).toBe(0);
    await replaceReportedAppReview(original.id, "ar-admin");
    const retired = await prisma.appReview.findUniqueOrThrow({ where: { id: original.id } });
    expect(retired.retiredAt).not.toBeNull();
    expect(retired.accessIssue).toBe(feedback.comment);
    const current = await getStudentAppReviews(user(0));
    expect(current.reviews).toHaveLength(5);
    expect(current.reviews.map((row) => row.appUrl)).not.toContain(original.appUrl);
  });
  it("persists five reviews, makes retries idempotent, and leaves grades untouched", async () => {
    const targets = (await getStudentAppReviews(user(0))).reviews;
    for (const target of targets) await submitAppReview(user(0), target.id, feedback);
    expect((await getStudentAppReviews(user(0))).completed).toBe(5);
    await expect(submitAppReview(user(0), targets[0].id, feedback)).resolves.toEqual({ ok: true });
    await expect(submitAppReview(user(0), targets[0].id, { ...feedback, overall: 5 })).rejects.toThrow("already been submitted");
    expect(await prisma.grade.count()).toBe(initialGrades);
    expect(await prisma.peerReview.count()).toBe(initialPeerReviews);
    await setAppReviewGate("ar-A", "closed", "ar-admin");
    const closed = await getStudentAppReviews(user(0));
    expect(closed.completed).toBe(5); expect(closed.reviews).toEqual([]);
    await expect(submitAppReview(user(8), (await prisma.appReview.findFirstOrThrow({ where: { reviewerId: user(8).userId } })).id, feedback)).rejects.toThrow("not open");
    await setAppReviewGate("ar-A", "open", "ar-admin");
  });
  it("reports roster and privacy gaps consistently without silently reassigning fenced evidence", async () => {
    const target = await prisma.appReview.findFirstOrThrow({ where: { reviewerId: "ar-u0", retiredAt: null }, include: { entry: true } });
    await prisma.user.update({ where: { id: target.entry.authorId }, data: { flaggedForDeletion: true } });
    try {
      expect(await getStudentAppReviews(user(0))).toMatchObject({ completed: 4, blocked: 1 });
      expect((await appReviewOverview()).users.find((row) => row.id === "ar-u0")).toMatchObject({ completed: 4, blocked: 1 });
      await expect(assignAppReviews(user(0))).rejects.toThrow("roster or privacy change");
    } finally { await prisma.user.update({ where: { id: target.entry.authorId }, data: { flaggedForDeletion: false } }); }
    await prisma.user.update({ where: { id: "ar-u0" }, data: { sectionId: "ar-B" } });
    try {
      expect(await getStudentAppReviews({ ...user(0), sectionId: "ar-B" })).toMatchObject({ completed: 0, blocked: 5, reviews: [] });
      expect((await appReviewOverview()).users.find((row) => row.id === "ar-u0")).toMatchObject({ completed: 0, blocked: 5 });
    } finally { await prisma.user.update({ where: { id: "ar-u0" }, data: { sectionId: "ar-A" } }); }
  });
  it("normalizes pasted whitespace and supports one-student reopen through the existing API", async () => {
    const exceptions = await import("../app/api/gates/exception/route");
    await setAppReviewGate("ar-A", "closed", "ar-admin");
    const response = await exceptions.POST(new Request("http://localhost/api/gates/exception", { method: "POST", headers: { cookie: "forge_test_user=ar-admin", "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "app_review", targetId: APP_REVIEW_ROUND_ID, email: user(8).email }) }));
    expect(response.status).toBe(200);
    const target = (await getStudentAppReviews(user(8))).reviews[0];
    await submitAppReview(user(8), target.id, { ...feedback, comment: "word\u00a0".repeat(20) });
    expect((await prisma.appReview.findUniqueOrThrow({ where: { id: target.id } })).comment).toBe("word ".repeat(20).trim());
    expect((await getStudentAppReviews(user(1))).open).toBe(false);
    await setAppReviewGate("ar-A", "open", "ar-admin");
  });
  it("enforces authentication and exposes faculty-only reporting through actual API handlers", async () => {
    const studentApi = await import("../app/api/app-reviews/route");
    const exportsApi = await import("../app/api/exports/app-reviews/route");
    const instructorApi = await import("../app/api/instructor/app-reviews/route");
    const req = (id: string) => new Request("http://localhost/api/exports/app-reviews?kind=completion", { headers: { cookie: `forge_test_user=${id}` } });
    expect((await studentApi.GET(new Request("http://localhost/api/app-reviews"))).status).toBe(401);
    expect((await exportsApi.GET(req("ar-u0"))).status).toBe(403);
    const post = (id: string, body: unknown) => new Request("http://localhost/api/app-reviews", { method: "POST", headers: { cookie: `forge_test_user=${id}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await instructorApi.POST(post("ar-u0", { action: "gate", sectionId: "ar-A", state: "closed" }))).status).toBe(403);
    const target = (await getStudentAppReviews(user(0))).reviews[0];
    expect((await studentApi.POST(post("ar-u1", { action: "submit", reviewId: target.id, review: feedback }))).status).toBe(404);
    expect((await studentApi.POST(post("ar-u0", { action: "submit", reviewId: target.id, review: { ...feedback, comment: "only three words" } }))).status).toBe(422);
    expect((await studentApi.POST(post("ar-u0", { action: "start", reviewerId: "ar-u1" }))).status).toBe(422);
    const response = await exportsApi.GET(req("ar-admin"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("ar-u0,PRIVATE CREATOR 0,ar0@example.org,AR-A,5,5,5,true,0");
    const inbox = await studentApi.GET(req("ar-u0"));
    expect(inbox.status).toBe(200);
    expect((await inbox.json()).completed).toBe(5);
    const scores = await exportsApi.GET(new Request("http://localhost/api/exports/app-reviews?kind=scores", { headers: { cookie: "forge_test_user=ar-admin" } }));
    expect(await scores.text()).toContain("lovable-peer-v1,none");
    await expect(prisma.appReview.update({ where: { id: target.id }, data: { overall: 5 } })).rejects.toThrow("immutable");
  });
});
