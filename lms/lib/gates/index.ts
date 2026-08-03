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
): Promise<boolean> {
  const exception = await prisma.gateException.findUnique({
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
 */
export async function resolveGate(ref: GateRef, now: Date = new Date()): Promise<boolean> {
  return (await resolveGateDetail(ref, now)).available;
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
export async function resolveGateDetail(ref: GateRef, now: Date = new Date()): Promise<GateDecision> {
  const { targetType, targetId, sectionId, parentSessionPageId, userId } = ref;
  const keys = [{ targetType, targetId, sectionId }];
  if (parentSessionPageId) {
    keys.push({ targetType: "session", targetId: parentSessionPageId, sectionId });
  }
  const gates = await prisma.gate.findMany({
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
  let available = ownState === "open" && parentOpen;
  if (!available && userId) {
    available = await hasLiveException(targetType, targetId, userId, now);
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

/**
 * Batched resolution for hubs and the Unlock Console: every gate row of a
 * section (or all sections when sectionId is null) with its EFFECTIVE state,
 * plus a stable content hash for cheap change polling.
 */
export async function resolveMany(
  sectionId: string | null,
  now: Date = new Date(),
): Promise<GateSnapshot> {
  const gates = await prisma.gate.findMany({
    where: sectionId ? { sectionId } : {},
    select: { targetType: true, targetId: true, sectionId: true, state: true, opensAt: true },
    orderBy: [{ sectionId: "asc" }, { targetType: "asc" }, { targetId: "asc" }],
  });
  const rows: SectionGateRow[] = gates.map((g) => ({
    targetType: g.targetType,
    targetId: g.targetId,
    sectionId: g.sectionId,
    state: effectiveGateState(g, now),
  }));
  const hash = createHash("sha1");
  for (const r of rows) hash.update(`${r.sectionId}|${r.targetType}|${r.targetId}|${r.state}\n`);
  return { version: hash.digest("hex"), rows };
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
  return rows.filter((r) => effectiveGateState(r, now) === "open").map((r) => r.targetId);
}

export type SetGateResult = { changed: boolean; before: GateState; after: GateState };

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
}): Promise<SetGateResult> {
  return prisma.$transaction((tx) => setGateStateIn(tx, args));
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
