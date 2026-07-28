import type { Material, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  isAvailable,
  liveExceptionTargets,
  resolveGate,
  resolveMany,
  type GateSnapshot,
} from "@/lib/gates";

// U7 — session hub data assembly. Everything the /sessions index and the
// /sessions/[no] hub render is gathered here (batched, resolveMany once) so
// the gate rules can be unit-tested against the seed without rendering pages.
//
// HARD RULE: a locked session leaks nothing beyond its title — not summaries,
// not material metadata. instructorOnly materials never enter student
// payloads at all, even by id.

const PREVIEWABLE = /\.(csv|pdf|png|jpe?g|gif|webp)$/i;

export type SessionCard =
  | { sessionNo: number; id: string; title: string; locked: true }
  | {
      sessionNo: number;
      id: string;
      title: string;
      locked: false;
      summaryMd: string;
      counts: { materials: number; assignments: number; quizzes: number };
    };

export type SessionsIndex = {
  sectionId: string | null;
  sessions: SessionCard[];
};

export type HubMaterial = {
  id: string;
  title: string;
  kind: string;
  sizeBytes: number | null;
  /** External launcher URL — only exposed when the material is available. */
  externalUrl: string | null;
  hasFile: boolean;
  available: boolean;
  previewable: boolean;
};

export type HubAssignment = {
  id: string;
  title: string;
  typeTitle: string;
  dueAt: Date | null;
  available: boolean;
  submissionStatus: SubmissionStatus | null;
};

export type HubQuiz = { id: string; title: string; armed: boolean };

export type SessionHub =
  | { locked: true; sessionNo: number; title: string }
  | {
      locked: false;
      sessionNo: number;
      id: string;
      title: string;
      summaryMd: string;
      materials: HubMaterial[];
      assignments: HubAssignment[];
      quizzes: HubQuiz[];
    };

type Viewer = {
  id: string;
  role: "student" | "instructor" | "admin";
  sectionId: string | null;
  teamId: string | null;
};

async function loadViewer(userId: string): Promise<Viewer> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, sectionId: true, teamId: true },
  });
  if (!user) throw new Error(`materials: unknown user ${userId}`);
  return user;
}

function targetAvailable(
  viewer: Viewer,
  snapshot: GateSnapshot,
  exceptions: Set<string>,
  targetType: "session" | "material" | "assignment" | "quiz",
  targetId: string,
  parentSessionPageId?: string,
): boolean {
  if (viewer.role !== "student") return true; // staff see everything
  if (!viewer.sectionId) return false;
  if (exceptions.has(`${targetType}:${targetId}`)) return true;
  return isAvailable(snapshot, targetType, targetId, viewer.sectionId, parentSessionPageId);
}

/** The /sessions index: 10 cards; locked cards are title-only. */
export async function getSessionsIndex(userId: string): Promise<SessionsIndex> {
  const viewer = await loadViewer(userId);
  const [pages, snapshot, exceptions, materials] = await Promise.all([
    prisma.sessionPage.findMany({ orderBy: { sessionNo: "asc" } }),
    resolveMany(viewer.role === "student" ? viewer.sectionId : null),
    viewer.role === "student" ? liveExceptionTargets(viewer.id) : new Set<string>(),
    prisma.material.findMany({ select: { id: true, instructorOnly: true, sectionIds: true } }),
  ]);
  const studentVisibleMaterial = new Map(
    materials.map((m) => [
      m.id,
      !m.instructorOnly && (!viewer.sectionId || m.sectionIds.includes(viewer.sectionId)),
    ]),
  );

  const sessions: SessionCard[] = pages.map((p) => {
    const open = targetAvailable(viewer, snapshot, exceptions, "session", p.id);
    if (!open) return { sessionNo: p.sessionNo, id: p.id, title: p.title, locked: true };
    return {
      sessionNo: p.sessionNo,
      id: p.id,
      title: p.title,
      locked: false,
      summaryMd: p.summaryMd,
      counts: {
        materials: p.orderedMaterialIds.filter(
          (id) => viewer.role !== "student" || studentVisibleMaterial.get(id),
        ).length,
        assignments: p.linkedAssignmentIds.length,
        quizzes: p.linkedQuizIds.length,
      },
    };
  });

  return { sectionId: viewer.sectionId, sessions };
}

/** The single in-class surface: one session's gated materials/assignments/quiz. */
export async function getSessionHub(
  userId: string,
  sessionNo: number,
): Promise<SessionHub | null> {
  const viewer = await loadViewer(userId);
  const page = await prisma.sessionPage.findUnique({ where: { sessionNo } });
  if (!page) return null;

  const [snapshot, exceptions] = await Promise.all([
    resolveMany(viewer.role === "student" ? viewer.sectionId : null),
    viewer.role === "student" ? liveExceptionTargets(viewer.id) : new Set<string>(),
  ]);

  // Locked session → title + lock, NOTHING else (even on direct URL access).
  if (!targetAvailable(viewer, snapshot, exceptions, "session", page.id)) {
    return { locked: true, sessionNo: page.sessionNo, title: page.title };
  }

  const mineOrTeam = viewer.teamId
    ? [{ userId: viewer.id }, { teamId: viewer.teamId }]
    : [{ userId: viewer.id }];

  const [materialRows, assignmentRows, quizRows, mySubs] = await Promise.all([
    prisma.material.findMany({ where: { id: { in: page.orderedMaterialIds } } }),
    prisma.assignment.findMany({
      where: { id: { in: page.linkedAssignmentIds } },
      select: {
        id: true,
        title: true,
        dueAt: true,
        assignmentType: { select: { title: true } },
      },
    }),
    prisma.quiz.findMany({
      where: { id: { in: page.linkedQuizIds } },
      select: { id: true, title: true, sectionIds: true },
    }),
    page.linkedAssignmentIds.length
      ? prisma.submission.findMany({
          where: { assignmentId: { in: page.linkedAssignmentIds }, OR: mineOrTeam },
          select: { assignmentId: true, status: true },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        })
      : [],
  ]);

  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const materialById = byId(materialRows);
  const assignmentById = byId(assignmentRows);
  const quizById = byId(quizRows);

  const latestStatus = new Map<string, SubmissionStatus>();
  for (const s of mySubs) {
    if (!latestStatus.has(s.assignmentId)) latestStatus.set(s.assignmentId, s.status);
  }

  const materials: HubMaterial[] = [];
  for (const id of page.orderedMaterialIds) {
    const m = materialById.get(id);
    if (!m) continue;
    // instructorOnly rows NEVER enter a student payload; section-scoped rows
    // only reach students of those sections.
    if (viewer.role === "student") {
      if (m.instructorOnly) continue;
      if (viewer.sectionId && !m.sectionIds.includes(viewer.sectionId)) continue;
    }
    const available = targetAvailable(viewer, snapshot, exceptions, "material", m.id, page.id);
    materials.push({
      id: m.id,
      title: m.title,
      kind: m.kind,
      sizeBytes: m.sizeBytes,
      externalUrl: available ? m.externalUrl : null,
      hasFile: Boolean(m.s3Key),
      available,
      previewable: available && Boolean(m.s3Key && PREVIEWABLE.test(m.s3Key)),
    });
  }

  const assignments: HubAssignment[] = [];
  for (const id of page.linkedAssignmentIds) {
    const a = assignmentById.get(id);
    if (!a) continue;
    assignments.push({
      id: a.id,
      title: a.title,
      typeTitle: a.assignmentType.title,
      dueAt: a.dueAt,
      available: targetAvailable(viewer, snapshot, exceptions, "assignment", a.id, page.id),
      submissionStatus: latestStatus.get(a.id) ?? null,
    });
  }

  const quizzes: HubQuiz[] = [];
  for (const id of page.linkedQuizIds) {
    const q = quizById.get(id);
    if (!q) continue;
    if (viewer.role === "student" && viewer.sectionId && !q.sectionIds.includes(viewer.sectionId)) {
      continue;
    }
    quizzes.push({
      id: q.id,
      title: q.title,
      // "Armed" is a live gate decision, not a schedule: quiz gate + session.
      armed:
        viewer.role === "student"
          ? targetAvailable(viewer, snapshot, exceptions, "quiz", q.id, page.id)
          : viewer.sectionId
            ? isAvailable(snapshot, "quiz", q.id, viewer.sectionId, page.id)
            : snapshot.rows.some(
                (r) => r.targetType === "quiz" && r.targetId === q.id && r.state === "open",
              ),
    });
  }

  return {
    locked: false,
    sessionNo: page.sessionNo,
    id: page.id,
    title: page.title,
    summaryMd: page.summaryMd,
    materials,
    assignments,
    quizzes,
  };
}

// ---------------------------------------------------------------------------
// Per-request material access (download / preview routes)
// ---------------------------------------------------------------------------

export type MaterialAccess =
  | { ok: true; material: Material }
  | { ok: false; status: 404 };

/**
 * Auth + gate check for one material fetch. Students go through resolveGate
 * with their userId (honours per-student GateExceptions AND the parent
 * session rule); staff always pass. Everything unavailable is a plain 404 —
 * existence is never leaked.
 */
export async function resolveMaterialAccess(
  user: { userId: string; role: "student" | "instructor" | "admin"; sectionId: string | null },
  materialId: string,
): Promise<MaterialAccess> {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) return { ok: false, status: 404 };
  if (user.role !== "student") return { ok: true, material };

  if (material.instructorOnly) return { ok: false, status: 404 };
  if (!user.sectionId || !material.sectionIds.includes(user.sectionId)) {
    return { ok: false, status: 404 };
  }
  const page = await prisma.sessionPage.findUnique({
    where: { sessionNo: material.sessionNo },
    select: { id: true },
  });
  const available = await resolveGate({
    targetType: "material",
    targetId: material.id,
    sectionId: user.sectionId,
    parentSessionPageId: page?.id,
    userId: user.userId,
  });
  return available ? { ok: true, material } : { ok: false, status: 404 };
}
