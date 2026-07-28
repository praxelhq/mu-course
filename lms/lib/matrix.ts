import type { SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv-export";

// U8 — instructor section matrix: rows = the section's students, columns =
// assignments, cell = the latest-version submission status. ONE batched
// submission query (no N+1): every submission by a section student or a
// section team, reduced in memory. Team submissions count for every member.

export type MatrixCell = { status: SubmissionStatus; version: number };

export type MatrixStudentRow = {
  id: string;
  name: string;
  email: string;
  teamId: string | null;
  teamName: string | null;
  /** assignmentId → latest cell; absent key = no submission yet. */
  cells: Record<string, MatrixCell>;
};

export type MatrixAssignment = {
  id: string;
  title: string;
  sessionNo: number | null;
  teamBased: boolean;
};

export type MatrixTeamRow = {
  id: string;
  name: string;
  sectorName: string;
  signOff: { status: string; note: string | null; evidenceS3Key: string | null } | null;
};

export type SectionMatrix = {
  sectionId: string;
  sectionCode: string;
  students: MatrixStudentRow[];
  assignments: MatrixAssignment[];
  teams: MatrixTeamRow[];
};

export async function getSectionMatrix(sectionId: string): Promise<SectionMatrix> {
  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) throw new Error(`getSectionMatrix: unknown section ${sectionId}`);

  const [students, teams, assignments] = await Promise.all([
    prisma.user.findMany({
      where: { sectionId, role: "student" },
      select: { id: true, name: true, email: true, teamId: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      where: { sectionId },
      select: { id: true, name: true, sectorName: true },
      orderBy: { name: "asc" },
    }),
    prisma.assignment.findMany({
      select: {
        id: true,
        title: true,
        sessionNo: true,
        assignmentType: { select: { teamBased: true } },
      },
      orderBy: [{ sessionNo: "asc" }, { title: "asc" }],
    }),
  ]);

  const studentIds = students.map((s) => s.id);
  const teamIds = teams.map((t) => t.id);

  // THE one batched submissions query — ordered so the first row seen per
  // (owner, assignment) is the latest version.
  const subs = await prisma.submission.findMany({
    where: {
      OR: [
        { userId: { in: studentIds } },
        ...(teamIds.length ? [{ teamId: { in: teamIds } }] : []),
      ],
    },
    select: { assignmentId: true, userId: true, teamId: true, status: true, version: true },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });

  const byUser = new Map<string, MatrixCell>(); // `${userId}|${assignmentId}`
  const byTeam = new Map<string, MatrixCell>(); // `${teamId}|${assignmentId}`
  for (const s of subs) {
    const cell = { status: s.status, version: s.version };
    const uKey = `${s.userId}|${s.assignmentId}`;
    if (!byUser.has(uKey)) byUser.set(uKey, cell);
    if (s.teamId) {
      const tKey = `${s.teamId}|${s.assignmentId}`;
      if (!byTeam.has(tKey)) byTeam.set(tKey, cell);
    }
  }

  const studentRows: MatrixStudentRow[] = students.map((st) => {
    const cells: Record<string, MatrixCell> = {};
    for (const a of assignments) {
      // A team submission counts for every member; an individual submission
      // only for its author. Team cell wins for team-based assignments.
      const teamCell = st.teamId ? byTeam.get(`${st.teamId}|${a.id}`) : undefined;
      const ownCell = byUser.get(`${st.id}|${a.id}`);
      const cell = teamCell ?? ownCell;
      if (cell) cells[a.id] = cell;
    }
    return {
      id: st.id,
      name: st.name,
      email: st.email,
      teamId: st.teamId,
      teamName: teams.find((t) => t.id === st.teamId)?.name ?? null,
      cells,
    };
  });

  const signOffs = teamIds.length
    ? await prisma.signOff.findMany({ where: { teamId: { in: teamIds } } })
    : [];
  const signOffByTeam = new Map(signOffs.map((s) => [s.teamId, s]));

  return {
    sectionId: section.id,
    sectionCode: section.code,
    students: studentRows,
    assignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      sessionNo: a.sessionNo,
      teamBased: a.assignmentType.teamBased,
    })),
    teams: teams.map((t) => {
      const so = signOffByTeam.get(t.id);
      return {
        id: t.id,
        name: t.name,
        sectorName: t.sectorName,
        signOff: so
          ? { status: so.status, note: so.note, evidenceS3Key: so.evidenceS3Key }
          : null,
      };
    }),
  };
}

/** CSV of the matrix (injection-safe via lib/csv-export). */
export function matrixToCsv(matrix: SectionMatrix): string {
  const headers = ["Student", "Email", "Team", ...matrix.assignments.map((a) => a.title)];
  const rows = matrix.students.map((st) => [
    st.name,
    st.email,
    st.teamName ?? "",
    ...matrix.assignments.map((a) => {
      const cell = st.cells[a.id];
      return cell ? `${cell.status} (v${cell.version})` : "";
    }),
  ]);
  return toCsv(headers, rows);
}
