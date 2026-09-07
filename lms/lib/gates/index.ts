import { createHash } from "node:crypto";
import type { GateState, GateTarget, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

// Gate resolution lives here and only here (see CLAUDE.md invariants):
// routes and lib modules must not run ad-hoc Gate queries.
//
// THE RESOLUTION RULE (uniform everywhere):
//   effective state = open   if state == open,
//                            or state == locked && opensAt != null && opensAt <= now
//   effective state = closed if state == closed  (manual close always wins)
//   effective state = locked otherwise; a missing gate row means locked.
//
// A target is AVAILABLE to a student iff its own gate is effectively open AND
// its parent session's gate is effectively open for the student's section —
// unless the student holds an unexpired GateException for the target, which
// overrides both (the instructor's explicit per-student reopen).

type TxClient = Prisma.TransactionClient | PrismaClient;

export type GateLike = { state: GateState; opensAt: Date | null };

/** The one place the resolution rule is encoded. */
export function effectiveGateState(gate: GateLike | null | undefined, now: Date = new Date()): GateState {
  if (!gate) return "locked";
  if (gate.state === "closed") return "closed";
  if (gate.state === "open") return "open";
  // locked: opensAt is a scheduled-open convenience.
  if (gate.opensAt !== null && gate.opensAt.getTime() <= now.getTime()) return "open";
  return "locked";
}

export type GateRef = {
  targetType: GateTarget;
  targetId: string;
  sectionId: string;
  /** SessionPage.id of the parent session; omit when resolving a session itself. */
  parentSessionPageId?: string;
  /** Student user id — honors per-student GateExceptions when provided. */
  userId?: string;
};

async function hasLiveException(
  targetType: GateTarget,
  targetId: string,
  userId: string,
  now: Date,
  db: TxClient,
): Promise<boolean> {
  const exception = await db.gateException.findUnique({
    where: { targetType_targetId_userId: { targetType, targetId, userId } },
    select: { expiresAt: true },
  });
  if (!exception) return false;
  return exception.expiresAt === null || exception.expiresAt.getTime() > now.getTime();
}

/**
 * Is this target available? Own gate effectively open AND (when given) the
 * parent session's gate effectively open — or an unexpired per-student
 * exception. Missing rows are locked.
 * Pass the active transaction client when resolving inside a transaction;
 * borrowing a second pooled connection can deadlock a saturated pool.
 */
export async function resolveGate(ref: GateRef, now: Date = new Date(), db: TxClient = prisma): Promise<boolean> {
  return (await resolveGateDetail(ref, now, db)).available;
}

/**
 * SessionPage.id of the session that links this child target (undefined when
 * no session does). The shared lookup callers feed into GateRef's
 * parentSessionPageId.
 */
export async function parentSessionPageIdFor(
  targetType: Extract<GateTarget, "material" | "assignment" | "quiz">,
  targetId: string,
): Promise<string | undefined> {
  const field =
    targetType === "material"
      ? "orderedMaterialIds"
      : targetType === "assignment"
        ? "linkedAssignmentIds"
        : "linkedQuizIds";
  const page = await prisma.sessionPage.findFirst({
    where: { [field]: { has: targetId } },
    select: { id: true },
  });
  return page?.id;
}

export type GateDecision = {
  /** Full availability: own gate open AND parent open, or a live exception. */
  available: boolean;
  /** Effective state of the target's OWN gate (opensAt applied). */
  ownState: GateState;
  parentOpen: boolean;
  /** When the own gate was last manually closed (grace-window decisions). */
  closedAt: Date | null;
};

/**
 * resolveGate plus the detail a caller needs for close-grace decisions
 * (e.g. the quiz submit path accepts a submission for a short window after
 * the gate closes). Keeps Gate.closedAt reads inside lib/gates.
 */
export async function resolveGateDetail(ref: GateRef, now: Date = new Date(), db: TxClient = prisma): Promise<GateDecision> {
  const { targetType, targetId, sectionId, parentSessionPageId, userId } = ref;
  const keys = [{ targetType, targetId, sectionId }];
  if (parentSessionPageId) {
    keys.push({ targetType: "session", targetId: parentSessionPageId, sectionId });
  }
  const gates = await db.gate.findMany({
    where: { OR: keys },
    select: { targetType: true, targetId: true, state: true, opensAt: true, closedAt: true },
  });
  const own = gates.find((g) => g.targetType === targetType && g.targetId === targetId);
  const parent = parentSessionPageId
    ? gates.find((g) => g.targetType === "session" && g.targetId === parentSessionPageId)
    : undefined;

  const ownState = effectiveGateState(own ?? null, now);
  const parentOpen = parentSessionPageId
    ? effectiveGateState(parent ?? null, now) === "open"
    : true;
  const contractEligible =
    targetType !== "quiz" || (await quizEligibilityIn(db, targetId)).eligible;
  let available = contractEligible && ownState === "open" && parentOpen;
  if (contractEligible && !available && userId) {
    available = await hasLiveException(targetType, targetId, userId, now, db);
  }
  return { available, ownState, parentOpen, closedAt: own?.closedAt ?? null };
}

/**
 * All of a student's unexpired exception targets as "targetType:targetId"
 * keys — one query, for hub pages that otherwise render from a resolveMany
 * snapshot. Keeps GateException reads inside lib/gates (CLAUDE.md invariant).
 */
export async function liveExceptionTargets(
  userId: string,
  now: Date = new Date(),
): Promise<Set<string>> {
  const rows = await prisma.gateException.findMany({
    where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { targetType: true, targetId: true },
  });
  return new Set(rows.map((r) => `${r.targetType}:${r.targetId}`));
}

export type SectionGateRow = {
  targetType: GateTarget;
  targetId: string;
  sectionId: string;
  /** Effective state (opensAt already applied). */
  state: GateState;
};

export type GateSnapshot = { version: string; rows: SectionGateRow[] };

export type GateGrantLike = {
  id: string;
  assignmentId: string;
  ownerKind: string;
  ownerId: string;
  kind: string;
  targetVersion: number;
  targetAttempt: number;
  expiresAt: Date;
  consumedAt: Date | null;
  extendedAt: Date | null;
};

/**
 * Content address for the student's polling surface. Revision grants are part
 * of availability even when the underlying assignment gate remains closed,
 * so their creation, extension and consumption must invalidate the snapshot.
 */
export function gateSnapshotVersion(
  rows: SectionGateRow[],
  grants: GateGrantLike[],
): string {
  const hash = createHash("sha1");
  for (const row of [...rows].sort((left, right) =>
    `${left.sectionId}|${left.targetType}|${left.targetId}`.localeCompare(
      `${right.sectionId}|${right.targetType}|${right.targetId}`,
    ),
  )) {
    hash.update(`${row.sectionId}|${row.targetType}|${row.targetId}|${row.state}\n`);
  }
  hash.update("--grants--\n");
  for (const grant of [...grants].sort((left, right) => left.id.localeCompare(right.id))) {
    hash.update(
      [
        grant.id,
        grant.assignmentId,
        grant.ownerKind,
        grant.ownerId,
        grant.kind,
        grant.targetVersion,
        grant.targetAttempt,
        grant.expiresAt.toISOString(),
        grant.consumedAt?.toISOString() ?? "",
        grant.extendedAt?.toISOString() ?? "",
      ].join("|"),
    );
    hash.update("\n");
  }
  return hash.digest("hex");
}

/**
 * Batched resolution for hubs and the Unlock Console: every gate row of a
 * section (or all sections when sectionId is null) with its EFFECTIVE state,
 * plus a stable content hash for cheap change polling.
 */
export async function resolveMany(
  sectionId: string | null,
  now: Date = new Date(),
): Promise<GateSnapshot> {
  const [gates, grants, versionedQuizzes] = await Promise.all([
    prisma.gate.findMany({
      where: sectionId ? { sectionId } : {},
      select: { targetType: true, targetId: true, sectionId: true, state: true, opensAt: true },
      orderBy: [{ sectionId: "asc" }, { targetType: "asc" }, { targetId: "asc" }],
    }),
    prisma.resubmissionGrant.findMany({
      select: {
        id: true,
        assignmentId: true,
        ownerKind: true,
        ownerId: true,
        kind: true,
        targetVersion: true,
        targetAttempt: true,
        expiresAt: true,
        consumedAt: true,
        extendedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.quiz.findMany({
      where: { contractMode: "versioned" },
      select: {
        id: true,
        contractMode: true,
        publishedAt: true,
        classificationFinalizedAt: true,
        classifiedBy: true,
        contentHash: true,
        answerMode: true,
        feedbackReleaseAt: true,
      },
    }),
  ]);
  const versionedQuizEligibility = new Map(
    versionedQuizzes.map((quiz) => [quiz.id, quizOpenEligibility(quiz).eligible]),
  );
  const rows: SectionGateRow[] = gates.map((g) => ({
    targetType: g.targetType,
    targetId: g.targetId,
    sectionId: g.sectionId,
    state:
      g.targetType === "quiz" && versionedQuizEligibility.get(g.targetId) === false
        ? "locked"
        : effectiveGateState(g, now),
  }));
  return { version: gateSnapshotVersion(rows, grants), rows };
}

/** Availability check over a resolveMany snapshot (no extra queries). */
export function isAvailable(
  snapshot: GateSnapshot,
  targetType: GateTarget,
  targetId: string,
  sectionId: string,
  parentSessionPageId?: string,
): boolean {
  const state = (tt: GateTarget, tid: string) =>
    snapshot.rows.find(
      (r) => r.targetType === tt && r.targetId === tid && r.sectionId === sectionId,
    )?.state ?? "locked";
  if (state(targetType, targetId) !== "open") return false;
  if (parentSessionPageId && state("session", parentSessionPageId) !== "open") return false;
  return true;
}

/** Batched: all target ids of a type effectively open for a section. */
export async function openTargetIds(
  targetType: GateTarget,
  sectionId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const rows = await prisma.gate.findMany({
    where: { targetType, sectionId },
    select: { targetId: true, state: true, opensAt: true },
  });
  const openRows = rows.filter((row) => effectiveGateState(row, now) === "open");
  if (targetType !== "quiz" || openRows.length === 0) return openRows.map((row) => row.targetId);
  const quizzes = await prisma.quiz.findMany({
    where: { id: { in: openRows.map((row) => row.targetId) } },
    select: {
      id: true,
      contractMode: true,
      publishedAt: true,
      classificationFinalizedAt: true,
      classifiedBy: true,
      contentHash: true,
      answerMode: true,
      feedbackReleaseAt: true,
    },
  });
  const eligible = new Set(
    quizzes.filter((quiz) => quizOpenEligibility(quiz).eligible).map((quiz) => quiz.id),
  );
  return openRows.filter((row) => eligible.has(row.targetId)).map((row) => row.targetId);
}

export type SetGateResult = { changed: boolean; before: GateState; after: GateState };

export type QuizGateContract = {
  contractMode: "legacy" | "versioned";
  publishedAt: Date | null;
  classificationFinalizedAt: Date | null;
  classifiedBy: string | null;
  contentHash: string | null;
  answerMode: "legacy_index" | "stable_id";
  feedbackReleaseAt: Date | null;
};

export type QuizOpenEligibility = {
  eligible: boolean;
  reason:
    | "missing_quiz"
    | "unpublished"
    | "classification_not_finalized"
    | "missing_content_hash"
    | "unstable_answer_mode"
    | "feedback_release_unscheduled"
    | null;
};

/** Legacy quizzes retain their existing gate behavior; versioned candidates fail closed. */
export function quizOpenEligibility(
  quiz: QuizGateContract | null | undefined,
): QuizOpenEligibility {
  if (!quiz) return { eligible: false, reason: "missing_quiz" };
  if (quiz.contractMode === "legacy") return { eligible: true, reason: null };
  if (!quiz.publishedAt) return { eligible: false, reason: "unpublished" };
  if (!quiz.classificationFinalizedAt || !quiz.classifiedBy) {
    return { eligible: false, reason: "classification_not_finalized" };
  }
  if (!quiz.contentHash) return { eligible: false, reason: "missing_content_hash" };
  if (quiz.answerMode !== "stable_id") {
    return { eligible: false, reason: "unstable_answer_mode" };
  }
  if (!quiz.feedbackReleaseAt) {
    return { eligible: false, reason: "feedback_release_unscheduled" };
  }
  return { eligible: true, reason: null };
}

export class QuizGateContractError extends Error {
  readonly reason: NonNullable<QuizOpenEligibility["reason"]>;

  constructor(reason: NonNullable<QuizOpenEligibility["reason"]>) {
    super(`Quiz cannot be opened until its versioned contract is eligible (${reason}).`);
    this.name = "QuizGateContractError";
    this.reason = reason;
  }
}

async function quizEligibilityIn(tx: TxClient, quizId: string): Promise<QuizOpenEligibility> {
  const quiz = await tx.quiz.findUnique({
    where: { id: quizId },
    select: {
      contractMode: true,
      publishedAt: true,
      classificationFinalizedAt: true,
      classifiedBy: true,
      contentHash: true,
      answerMode: true,
      feedbackReleaseAt: true,
    },
  });
  return quizOpenEligibility(quiz);
}

// Shared by setGateState and the bulk helpers so single and bulk toggles are
// audited identically. Skips the write (and the audit row) when the stored
// state already matches — double-toggles are idempotent.
async function setGateStateIn(
  tx: TxClient,
  args: {
    targetType: GateTarget;
    targetId: string;
    sectionId: string;
    state: GateState;
    actorId: string;
  },
): Promise<SetGateResult> {
  const { targetType, targetId, sectionId, state, actorId } = args;
  const where = { targetType_targetId_sectionId: { targetType, targetId, sectionId } };
  const existing = await tx.gate.findUnique({ where });
  const before: GateState = existing?.state ?? "locked";
  if (existing && before === state) return { changed: false, before, after: state };

  const now = new Date();
  const stamps = {
    changedBy: actorId,
    ...(state === "open" ? { openedAt: now } : {}),
    ...(state === "closed" ? { closedAt: now } : {}),
  };
  await tx.gate.upsert({
    where,
    update: { state, ...stamps },
    create: { targetType, targetId, sectionId, state, ...stamps },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      action: "gate.set",
      targetType: `gate:${targetType}`,
      targetId,
      before: { state: before, sectionId },
      after: { state, sectionId },
    },
  });
  return { changed: true, before, after: state };
}

/** Manual instructor toggle: upsert + AuditLog (before/after) in one transaction. */
export async function setGateState(args: {
  targetType: GateTarget;
  targetId: string;
  sectionId: string;
  state: GateState;
  actorId: string;
}, transaction?: Prisma.TransactionClient): Promise<SetGateResult> {
  const change = async (tx: Prisma.TransactionClient) => {
    if (args.state === "open" && args.targetType === "quiz") {
      const eligibility = await quizEligibilityIn(tx, args.targetId);
      if (!eligibility.eligible) throw new QuizGateContractError(eligibility.reason!);
    }
    return setGateStateIn(tx, args);
  };
  return transaction ? change(transaction) : prisma.$transaction(change);
}

async function sessionChildTargets(
  tx: TxClient,
  sessionPageId: string,
): Promise<{ targetType: GateTarget; targetId: string }[]> {
  const page = await tx.sessionPage.findUnique({
    where: { id: sessionPageId },
    select: { orderedMaterialIds: true, linkedAssignmentIds: true, linkedQuizIds: true },
  });
  if (!page) throw new Error(`sessionChildTargets: unknown session page ${sessionPageId}`);
  return [
    ...page.orderedMaterialIds.map((id) => ({ targetType: "material" as const, targetId: id })),
    ...page.linkedAssignmentIds.map((id) => ({ targetType: "assignment" as const, targetId: id })),
    ...page.linkedQuizIds.map((id) => ({ targetType: "quiz" as const, targetId: id })),
  ];
}

async function bulkSetSession(
  sessionPageId: string,
  sectionId: string,
  actorId: string,
  state: GateState,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const children = await sessionChildTargets(tx, sessionPageId);
    const targets = [
      { targetType: "session" as const, targetId: sessionPageId },
      ...children,
    ];
    for (const t of targets) {
      if (state === "open" && t.targetType === "quiz") {
        const eligibility = await quizEligibilityIn(tx, t.targetId);
        if (!eligibility.eligible) {
          // A previously opened candidate is actively returned to locked; the
          // session and its other eligible children still open atomically.
          await setGateStateIn(tx, { ...t, sectionId, state: "locked", actorId });
          await tx.auditLog.create({
            data: {
              actorId,
              action: "gate.open.skip-ineligible-quiz",
              targetType: "gate:quiz",
              targetId: t.targetId,
              after: { sectionId, state: "locked", reason: eligibility.reason },
            },
          });
          continue;
        }
      }
      await setGateStateIn(tx, { ...t, sectionId, state, actorId });
    }
  });
}

/** One transaction: open the session gate plus all its materials/assignments/quizzes. */
export async function bulkOpenSession(
  sessionPageId: string,
  sectionId: string,
  actorId: string,
): Promise<void> {
  return bulkSetSession(sessionPageId, sectionId, actorId, "open");
}

/** One transaction: close the session gate plus all its children. */
export async function bulkCloseSession(
  sessionPageId: string,
  sectionId: string,
  actorId: string,
): Promise<void> {
  return bulkSetSession(sessionPageId, sectionId, actorId, "closed");
}

/** Per-student reopen: upsert the exception + AuditLog in one transaction. */
export async function grantException(args: {
  targetType: GateTarget;
  targetId: string;
  sectionId: string;
  userId: string;
  grantedBy: string;
  expiresAt?: Date | null;
}): Promise<void> {
  const { targetType, targetId, sectionId, userId, grantedBy } = args;
  const expiresAt = args.expiresAt ?? null;
  await prisma.$transaction(async (tx) => {
    if (targetType === "quiz") {
      const eligibility = await quizEligibilityIn(tx, targetId);
      if (!eligibility.eligible) throw new QuizGateContractError(eligibility.reason!);
    }
    await tx.gateException.upsert({
      where: { targetType_targetId_userId: { targetType, targetId, userId } },
      update: { sectionId, expiresAt, grantedBy },
      create: { targetType, targetId, sectionId, userId, expiresAt, grantedBy },
    });
    await tx.auditLog.create({
      data: {
        actorId: grantedBy,
        action: "gate.exception.grant",
        targetType: `gate:${targetType}`,
        targetId,
        after: { userId, sectionId, expiresAt: expiresAt?.toISOString() ?? null },
      },
    });
  });
}

/** Revoke a per-student exception (no-op when absent). */
export async function revokeException(args: {
  targetType: GateTarget;
  targetId: string;
  userId: string;
  actorId: string;
}): Promise<void> {
  const { targetType, targetId, userId, actorId } = args;
  await prisma.$transaction(async (tx) => {
    const deleted = await tx.gateException.deleteMany({
      where: { targetType, targetId, userId },
    });
    if (deleted.count > 0) {
      await tx.auditLog.create({
        data: {
          actorId,
          action: "gate.exception.revoke",
          targetType: `gate:${targetType}`,
          targetId,
          before: { userId },
        },
      });
    }
  });
}

/** Exceptions for one target, with the student's identity (console listing). */
export async function listExceptions(targetType: GateTarget, targetId: string) {
  const exceptions = await prisma.gateException.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "asc" },
  });
  if (exceptions.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: exceptions.map((e) => e.userId) } },
    select: { id: true, email: true, name: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return exceptions.map((e) => ({
    userId: e.userId,
    email: byId.get(e.userId)?.email ?? e.userId,
    name: byId.get(e.userId)?.name ?? "(unknown)",
    sectionId: e.sectionId,
    expiresAt: e.expiresAt,
    createdAt: e.createdAt,
  }));
}
