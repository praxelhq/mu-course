import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveGate, setGateState } from "@/lib/gates";
import type { SessionUser } from "@/lib/auth";
import { APP_REVIEW_ROUND_ID, APP_REVIEW_RUBRIC_VERSION, chooseAppReviews, commentSchema, normalizeAppUrl, REQUIRED_APP_REVIEWS, reviewSchema, type StudentAppReview } from "./policy";

export class AppReviewError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
export function appReviewError(error: unknown): AppReviewError | null {
  if (error instanceof AppReviewError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2024", "P2028"].includes(error.code)) {
    return new AppReviewError("The review service is busy. Your work was not changed; please retry.", 503);
  }
  return null;
}
type Db = PrismaClient;
type Tx = Prisma.TransactionClient;
const TRANSACTION_OPTIONS = { maxWait: 15000, timeout: 20000 };

async function lockRound(tx: Tx, shared = false) {
  if (shared) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${APP_REVIEW_ROUND_ID}, 0))::text`;
    return;
  }
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${APP_REVIEW_ROUND_ID}, 0))::text`;
}
async function lockOperation(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${APP_REVIEW_ROUND_ID}:${key}`}, 0))::text`;
}
function student(user: SessionUser): asserts user is SessionUser & { sectionId: string } {
  if (user.role !== "student" || !user.sectionId) throw new AppReviewError("A rostered student account with a section is required.", 403);
}
async function available(user: SessionUser, db: Tx = prisma) {
  student(user);
  return resolveGate({ targetType: "app_review", targetId: APP_REVIEW_ROUND_ID, sectionId: user.sectionId, userId: user.userId }, new Date(), db);
}
async function requireOpen(user: SessionUser, db: Tx) {
  if (!(await available(user, db))) throw new AppReviewError("App peer review is not open for your section.");
}
const activeWhere = (user: SessionUser) => ({
  roundId: APP_REVIEW_ROUND_ID, reviewerId: user.userId, retiredAt: null,
  entry: { sectionId: user.sectionId!, author: { sectionId: user.sectionId!, flaggedForDeletion: false } },
});

// This allowlist is the privacy boundary for HTML, RSC and JSON alike.
function studentReceipt(row: Prisma.AppReviewGetPayload<{ include: { entry: true } }>): StudentAppReview {
  return { id: row.id, slot: row.slot, appUrl: row.entry.appUrl, visual: row.visual,
    functionality: row.functionality, overall: row.overall, comment: row.comment,
    completedAt: row.completedAt?.toISOString() ?? null, accessIssue: row.accessIssue };
}
export async function getStudentAppReviews(user: SessionUser, db: Db = prisma) {
  student(user);
  const round = await db.appReviewRound.findUnique({ where: { id: APP_REVIEW_ROUND_ID } });
  const open = !!round && round.rubricVersion === APP_REVIEW_RUBRIC_VERSION && await available(user, db);
  // Closed/locked rounds do not disclose target URLs or other students' work.
  const rows = await db.appReview.findMany({ where: activeWhere(user), include: { entry: true }, orderBy: { slot: "asc" } });
  const assigned = await db.appReview.count({ where: { roundId: APP_REVIEW_ROUND_ID, reviewerId: user.userId, retiredAt: null } });
  return { ready: !!round, open, required: REQUIRED_APP_REVIEWS,
    blocked: assigned - rows.length,
    completed: rows.filter((row) => row.completedAt).length,
    reviews: open ? rows.map(studentReceipt) : [] };
}

async function candidates(tx: Tx, sectionId: string) {
  const entries = await tx.appReviewEntry.findMany({
    where: { roundId: APP_REVIEW_ROUND_ID, sectionId, author: { sectionId, flaggedForDeletion: false, role: "student" } },
    include: { _count: { select: { reviews: { where: { retiredAt: null } } } } },
  });
  return entries.map((entry) => ({ ...entry, load: entry._count.reviews }));
}
export async function assignAppReviews(user: SessionUser, db: Db = prisma) {
  student(user);
  await db.$transaction(async (tx) => {
    // The shared round lock keeps gate/import changes ordered without making
    // unrelated students queue behind every review submission.
    await lockRound(tx, true);
    await lockOperation(tx, "allocation");
    await requireOpen(user, tx);
    const round = await tx.appReviewRound.findUnique({ where: { id: APP_REVIEW_ROUND_ID } });
    if (round?.rubricVersion !== APP_REVIEW_RUBRIC_VERSION) throw new AppReviewError("This review round is not ready.");
    const existing = await tx.appReview.findMany({ where: { roundId: APP_REVIEW_ROUND_ID, reviewerId: user.userId }, include: { entry: true } });
    const active = existing.filter((row) => !row.retiredAt);
    const visible = await tx.appReview.count({ where: activeWhere(user) });
    if (visible !== active.length) throw new AppReviewError("An assignment is unavailable after a roster or privacy change. Your instructor must resolve that change before you can request remaining apps; saved evidence is retained.");
    const needed = REQUIRED_APP_REVIEWS - active.length;
    if (needed <= 0) return;
    const selected = chooseAppReviews(await candidates(tx, user.sectionId), user, existing.map((row) => row.entry), needed);
    if (selected.length !== needed) throw new AppReviewError("There are not yet five distinct other apps available in your section. Please contact your instructor; your existing reviews are saved.");
    const slots = [1, 2, 3, 4, 5].filter((slot) => !active.some((row) => row.slot === slot));
    await tx.appReview.createMany({ data: selected.map((entry, i) => ({ roundId: APP_REVIEW_ROUND_ID, reviewerId: user.userId, entryId: entry.id, slot: slots[i] })) });
  }, TRANSACTION_OPTIONS);
  return getStudentAppReviews(user, db);
}

export async function submitAppReview(user: SessionUser, reviewId: string, body: unknown, db: Db = prisma) {
  student(user);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) throw new AppReviewError(parsed.error.issues[0]?.message ?? "Invalid review.", 422);
  return db.$transaction(async (tx) => {
    await lockRound(tx, true);
    await lockOperation(tx, `review:${reviewId}`);
    await requireOpen(user, tx);
    const review = await tx.appReview.findFirst({ where: { id: reviewId, ...activeWhere(user) } });
    if (!review) {
      const retired = await tx.appReview.findFirst({
        where: { id: reviewId, roundId: APP_REVIEW_ROUND_ID, reviewerId: user.userId, retiredAt: { not: null } },
        select: { id: true },
      });
      if (retired) throw new AppReviewError("Your instructor replaced this app. Copy any feedback you want to keep, then reload for the new assignment.");
      throw new AppReviewError("Review not found.", 404);
    }
    if (review.completedAt) {
      if (["visual", "functionality", "overall", "comment"].every((key) => review[key as keyof typeof parsed.data] === parsed.data[key as keyof typeof parsed.data])) return { ok: true };
      throw new AppReviewError("This review has already been submitted and cannot be changed.");
    }
    await tx.appReview.update({ where: { id: reviewId }, data: { ...parsed.data, completedAt: new Date() } });
    return { ok: true };
  }, TRANSACTION_OPTIONS);
}

export async function reportAppReviewIssue(user: SessionUser, reviewId: string, comment: unknown, db: Db = prisma) {
  student(user);
  const parsed = commentSchema.safeParse(comment);
  if (!parsed.success) throw new AppReviewError("Describe the access problem in at least 20 words (maximum 5,000 characters).", 422);
  return db.$transaction(async (tx) => {
    await lockRound(tx, true);
    await lockOperation(tx, `review:${reviewId}`);
    await requireOpen(user, tx);
    const row = await tx.appReview.findFirst({ where: { id: reviewId, ...activeWhere(user), completedAt: null } });
    if (!row) throw new AppReviewError("Pending review not found.", 404);
    await tx.appReview.update({ where: { id: row.id }, data: { accessIssue: parsed.data } });
    return { ok: true };
  }, TRANSACTION_OPTIONS);
}

export type ImportAppRow = { email: string; section: string; appUrl: string; sourceRef: string; recordNumber?: number };
export async function importAppReviewEntries(rows: ImportAppRow[], actorId: string, apply: boolean, db: Db = prisma) {
  return db.$transaction(async (tx) => {
    // Preview performs no writes. Apply revalidates everything while holding
    // the exclusive round lock, so a preview never needs to block learners.
    if (apply) await lockRound(tx);
    const assignment = await tx.assignment.findUnique({ where: { id: "asg_s4_app" } });
    if (!assignment) throw new AppReviewError("Session 4 app assignment is not configured.");
    const users = await tx.user.findMany({ where: { role: "student", flaggedForDeletion: false }, include: { emailAliases: true, section: true } });
    const identities = new Map(users.flatMap((user) => [user.email, ...user.emailAliases.map((alias) => alias.email)].map((email) => [email.toLowerCase(), user] as const)));
    const existing = await tx.appReviewEntry.findMany({ where: { roundId: APP_REVIEW_ROUND_ID } });
    const errors: { row: number; reason: string }[] = [];
    const seen = new Set<string>();
    const data: Prisma.AppReviewEntryCreateManyInput[] = [];
    let unchanged = 0;
    rows.forEach((row, i) => {
      const user = identities.get(row.email.trim().toLowerCase());
      if (!user?.sectionId || !user.section || user.section.code !== row.section.trim().replace(/^section\s+/iu, "").toUpperCase()) {
        errors.push({ row: row.recordNumber ?? i + 1, reason: "Email/alias and section must match an existing rostered student." }); return;
      }
      try {
        const appUrl = normalizeAppUrl(row.appUrl);
        if (seen.has(user.id)) throw new Error("Duplicate student in import; select their intended final app first.");
        seen.add(user.id);
        const previous = existing.find((entry) => entry.authorId === user.id);
        if (previous) {
          if (previous.appUrl !== appUrl) throw new Error("An immutable review snapshot already exists for a different app.");
          unchanged += 1; return;
        }
        data.push({ roundId: APP_REVIEW_ROUND_ID, authorId: user.id, sectionId: user.sectionId, appUrl, sourceRef: row.sourceRef });
      } catch (error) { errors.push({ row: row.recordNumber ?? i + 1, reason: error instanceof Error ? error.message : "Invalid app URL." }); }
    });
    if (apply && errors.length === 0) {
      await tx.appReviewRound.upsert({ where: { id: APP_REVIEW_ROUND_ID }, update: {}, create: {
        id: APP_REVIEW_ROUND_ID, assignmentId: assignment.id, title: "Lovable app peer review", rubricVersion: APP_REVIEW_RUBRIC_VERSION,
      } });
      await tx.appReviewEntry.createMany({ data });
      await tx.auditLog.create({ data: { actorId, action: "app-review.import", targetType: "app-review-round", targetId: APP_REVIEW_ROUND_ID, after: { added: data.length, unchanged } } });
    }
    return { applied: apply && errors.length === 0, added: data.length, unchanged, errors };
  }, TRANSACTION_OPTIONS);
}

export async function setAppReviewGate(sectionId: string, state: "open" | "closed", actorId: string, db: Db = prisma) {
  // Same lock as submit makes a close and a submission strictly ordered.
  return db.$transaction(async (tx) => {
    await lockRound(tx);
    if (state === "open") {
      const pool = await candidates(tx, sectionId);
      const reviewers = await tx.user.findMany({ where: { sectionId, role: "student", flaggedForDeletion: false } });
      if (!reviewers.length || reviewers.some((user) => chooseAppReviews(pool, { userId: user.id, sectionId }, []).length < REQUIRED_APP_REVIEWS)) {
        throw new AppReviewError("Every student in this section needs five distinct other apps. Import/correct the missing apps before opening.");
      }
    }
    return setGateState({ targetType: "app_review", targetId: APP_REVIEW_ROUND_ID, sectionId, state, actorId }, tx);
  }, TRANSACTION_OPTIONS);
}

export async function replaceReportedAppReview(reviewId: string, actorId: string, db: Db = prisma) {
  return db.$transaction(async (tx) => {
    await lockRound(tx, true);
    await lockOperation(tx, `review:${reviewId}`);
    const review = await tx.appReview.findFirst({ where: { id: reviewId, roundId: APP_REVIEW_ROUND_ID, retiredAt: null, completedAt: null, accessIssue: { not: null } }, include: { reviewer: true } });
    if (!review?.reviewer.sectionId) throw new AppReviewError("No unresolved access report found.", 404);
    const history = await tx.appReview.findMany({ where: { roundId: APP_REVIEW_ROUND_ID, reviewerId: review.reviewerId }, include: { entry: true } });
    const [replacement] = chooseAppReviews(await candidates(tx, review.reviewer.sectionId), { userId: review.reviewerId, sectionId: review.reviewer.sectionId }, history.map((row) => row.entry), 1);
    if (!replacement) throw new AppReviewError("No unused replacement app is available in this section.");
    await tx.appReview.update({ where: { id: review.id }, data: { retiredAt: new Date() } });
    await tx.appReview.create({ data: { roundId: APP_REVIEW_ROUND_ID, reviewerId: review.reviewerId, entryId: replacement.id, slot: review.slot } });
    await tx.auditLog.create({ data: { actorId, action: "app-review.replace", targetType: "app-review", targetId: review.id, after: { replacementEntryId: replacement.id } } });
    return { ok: true };
  }, TRANSACTION_OPTIONS);
}

export async function appReviewOverview(db: Db = prisma) {
  const [users, entries, reviews] = await Promise.all([
    db.user.findMany({ where: { role: "student", flaggedForDeletion: false }, select: { id: true, name: true, email: true, sectionId: true, section: { select: { code: true } } }, orderBy: [{ sectionId: "asc" }, { name: "asc" }] }),
    db.appReviewEntry.findMany({ where: { roundId: APP_REVIEW_ROUND_ID }, include: { author: { select: { name: true, email: true, sectionId: true, flaggedForDeletion: true } } } }),
    db.appReview.findMany({ where: { roundId: APP_REVIEW_ROUND_ID }, orderBy: { assignedAt: "asc" } }),
  ]);
  const active = reviews.filter((row) => !row.retiredAt);
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  return { users: users.map((user) => {
    const assigned = active.filter((row) => row.reviewerId === user.id);
    const visible = assigned.filter((row) => {
      const entry = entriesById.get(row.entryId);
      return entry?.sectionId === user.sectionId && entry.author.sectionId === user.sectionId && !entry.author.flaggedForDeletion;
    });
    return { ...user, assigned: visible.length, completed: visible.filter((row) => row.completedAt).length, blocked: assigned.length - visible.length };
  }), entries, reviews };
}
