import type { InterviewStatus, Prisma, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { openTargetIds } from "@/lib/gates";
import { parseRubricScores } from "@/lib/review-queue";

// Student dashboard data assembly. Everything the /dashboard page shows is
// gathered here in batched queries (no N+1) so it can be unit-tested against
// the seed independently of the page. Team-based assignments count a team
// member's submission as "mine".

export type DashboardAssignment = {
  id: string;
  title: string;
  typeTitle: string;
  sessionNo: number | null;
  dueAt: Date | null;
  /** Status of my (or my team's) latest submission; null when none exists. */
  submissionStatus: SubmissionStatus | null;
};

export type DashboardGradeDimension = { key: string; score: number };

export type DashboardGrade = {
  submissionId: string;
  assignmentTitle: string;
  total: number;
  provisional: boolean;
  dimensions: DashboardGradeDimension[];
};

export type StudentDashboard = {
  user: { id: string; name: string; email: string; sectionCode: string | null };
  openAssignments: DashboardAssignment[];
  grades: DashboardGrade[];
  interview: {
    window: { opensAt: Date; closesAt: Date; label: string } | null;
    status: InterviewStatus | null;
  };
  team: { name: string; sectorName: string; members: string[] } | null;
  unreadNotifications: {
    id: string;
    title: string;
    body: string | null;
    createdAt: Date;
  }[];
};

function parseDimensions(rubricScores: Prisma.JsonValue): DashboardGradeDimension[] {
  return Object.entries(parseRubricScores(rubricScores)).map(([key, { score }]) => ({
    key,
    score,
  }));
}

export async function getStudentDashboard(userId: string): Promise<StudentDashboard> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      sectionId: true,
      teamId: true,
      section: { select: { code: true } },
      team: {
        select: {
          name: true,
          sectorName: true,
          members: { select: { name: true }, orderBy: { name: "asc" } },
        },
      },
    },
  });
  if (!user) throw new Error(`getStudentDashboard: unknown user ${userId}`);

  // "Mine" includes my team's submissions for team-based assignments.
  const mineOrTeam = user.teamId
    ? [{ userId }, { teamId: user.teamId }]
    : [{ userId }];

  const openIds = user.sectionId
    ? await openTargetIds("assignment", user.sectionId)
    : [];

  const [assignments, openSubs, gradedSubs, ivWindow, interview, unreadNotifications] =
    await Promise.all([
      prisma.assignment.findMany({
        where: { id: { in: openIds } },
        select: {
          id: true,
          title: true,
          sessionNo: true,
          dueAt: true,
          assignmentType: { select: { title: true } },
        },
        orderBy: [{ dueAt: "asc" }, { sessionNo: "asc" }],
      }),
      prisma.submission.findMany({
        where: { assignmentId: { in: openIds }, OR: mineOrTeam },
        select: { assignmentId: true, status: true },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      }),
      prisma.submission.findMany({
        where: { OR: mineOrTeam, grades: { some: {} } },
        select: {
          id: true,
          assignmentId: true,
          version: true,
          assignment: { select: { title: true } },
          grades: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { total: true, provisional: true, rubricScores: true },
          },
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      }),
      user.sectionId
        ? prisma.interviewWindow.findFirst({
            where: { sectionId: user.sectionId },
            select: { opensAt: true, closesAt: true, label: true },
            orderBy: { opensAt: "asc" },
          })
        : null,
      prisma.interview.findFirst({
        where: { userId },
        select: { status: true },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
      }),
      prisma.notification.findMany({
        where: { userId, readAt: null },
        select: { id: true, title: true, body: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  // Latest submission per assignment: rows are ordered version desc, so the
  // first row seen per assignment wins.
  const latestStatus = new Map<string, SubmissionStatus>();
  for (const s of openSubs) {
    if (!latestStatus.has(s.assignmentId)) latestStatus.set(s.assignmentId, s.status);
  }

  // Latest graded submission per assignment (a v2 resubmission supersedes v1).
  const seenAssignments = new Set<string>();
  const grades: DashboardGrade[] = [];
  for (const sub of gradedSubs) {
    if (seenAssignments.has(sub.assignmentId)) continue;
    seenAssignments.add(sub.assignmentId);
    const grade = sub.grades[0];
    if (!grade) continue;
    grades.push({
      submissionId: sub.id,
      assignmentTitle: sub.assignment.title,
      total: grade.total,
      provisional: grade.provisional,
      dimensions: parseDimensions(grade.rubricScores),
    });
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      sectionCode: user.section?.code ?? null,
    },
    openAssignments: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      typeTitle: a.assignmentType.title,
      sessionNo: a.sessionNo,
      dueAt: a.dueAt,
      submissionStatus: latestStatus.get(a.id) ?? null,
    })),
    grades,
    interview: { window: ivWindow, status: interview?.status ?? null },
    team: user.team
      ? {
          name: user.team.name,
          sectorName: user.team.sectorName,
          members: user.team.members.map((m) => m.name),
        }
      : null,
    unreadNotifications,
  };
}
