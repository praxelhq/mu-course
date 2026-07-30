import { prisma } from "@/lib/db";
import {
  buildGalleryPresentationItems,
  type GalleryPresentationItem,
} from "@/lib/gallery-presentation";
import { isRevealed } from "@/lib/votes";

// Instructor console data for the Session-2 artifacts: live per-section
// participation (who submitted what), marks where the artifact is AI-graded,
// how many upvotes each student has CAST (the vote-to-unlock signal), and the
// vote tally each gallery item RECEIVED. Instructors always see real numbers —
// the reveal flag only gates what students see.

export type ArtifactSummary = {
  assignmentId: string;
  title: string;
  slug: string;
  aiGraded: boolean;
  galleryEligible: boolean;
  submitted: number;
  graded: number;
  /** average total across graded submissions, null when none */
  avgTotal: number | null;
  /** whether vote counts are revealed to this section */
  revealed: boolean;
  /** Privacy-safe projector sequence for this section; empty for non-image artifacts. */
  presentationItems: GalleryPresentationItem[];
};

export type StudentRow = {
  userId: string;
  name: string;
  email: string;
  /** assignmentId -> submitted?/mark */
  cells: Record<string, { submitted: boolean; status: string | null; total: number | null }>;
  /** assignmentId -> votes this student CAST in that gallery */
  votesCast: Record<string, number>;
  /** assignmentId -> votes this student's submission RECEIVED */
  votesReceived: Record<string, number>;
};

export type Session2Console = {
  sectionId: string;
  sectionCode: string;
  totalStudents: number;
  artifacts: ArtifactSummary[];
  students: StudentRow[];
};

export async function getSession2Console(sectionId: string): Promise<Session2Console | null> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true, code: true },
  });
  if (!section) return null;

  const assignments = await prisma.assignment.findMany({
    where: { sessionNo: 2 },
    select: {
      id: true,
      title: true,
      assignmentType: { select: { slug: true, aiGraded: true, galleryEligible: true } },
    },
    orderBy: { id: "asc" },
  });
  const assignmentIds = assignments.map((a) => a.id);
  const galleryAssignmentIds = assignments
    .filter((assignment) => assignment.assignmentType.galleryEligible)
    .map((assignment) => assignment.id);

  const [students, submissions, gallerySubmissions, votes] = await Promise.all([
    prisma.user.findMany({
      where: { sectionId, role: "student" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.submission.findMany({
      where: { assignmentId: { in: assignmentIds }, user: { sectionId } },
      select: {
        id: true,
        assignmentId: true,
        userId: true,
        status: true,
        version: true,
        grades: { select: { total: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { votes: true } },
      },
      orderBy: { version: "desc" },
    }),
    prisma.submission.findMany({
      where: {
        assignmentId: { in: galleryAssignmentIds },
        user: { sectionId },
        status: { in: ["submitted", "graded", "finalised"] },
        galleryItem: { isNot: null },
      },
      select: {
        id: true,
        assignmentId: true,
        userId: true,
        status: true,
        version: true,
        attempt: true,
        fields: true,
        files: true,
        galleryItem: { select: { caption: true } },
      },
      orderBy: [{ version: "desc" }, { attempt: "desc" }],
    }),
    // Votes cast BY students of this section, grouped per gallery.
    prisma.vote.findMany({
      where: { voter: { sectionId }, submission: { assignmentId: { in: assignmentIds } } },
      select: { voterId: true, submission: { select: { assignmentId: true } } },
    }),
  ]);

  // Latest submission per (student, assignment) — rows are version-desc, so the
  // first one seen wins.
  const latest = new Map<string, (typeof submissions)[number]>();
  for (const s of submissions) {
    const key = `${s.userId}:${s.assignmentId}`;
    if (!latest.has(key)) latest.set(key, s);
  }

  const castCount = new Map<string, number>();
  for (const v of votes) {
    const key = `${v.voterId}:${v.submission.assignmentId}`;
    castCount.set(key, (castCount.get(key) ?? 0) + 1);
  }

  const rows: StudentRow[] = students.map((u) => {
    const cells: StudentRow["cells"] = {};
    const votesCast: Record<string, number> = {};
    const votesReceived: Record<string, number> = {};
    for (const a of assignments) {
      const s = latest.get(`${u.id}:${a.id}`);
      cells[a.id] = {
        submitted: Boolean(s),
        status: s?.status ?? null,
        total: s?.grades[0]?.total ?? null,
      };
      votesCast[a.id] = castCount.get(`${u.id}:${a.id}`) ?? 0;
      votesReceived[a.id] = s?._count.votes ?? 0;
    }
    return { userId: u.id, name: u.name, email: u.email, cells, votesCast, votesReceived };
  });

  const ownerNames = new Map(students.map((student) => [student.id, student.name]));
  const latestByAssignment = new Map<string, (typeof submissions)[number][]>();
  for (const submission of latest.values()) {
    const rows = latestByAssignment.get(submission.assignmentId) ?? [];
    rows.push(submission);
    latestByAssignment.set(submission.assignmentId, rows);
  }
  const presentationSourcesByAssignment = new Map<
    string,
    (typeof gallerySubmissions)[number][]
  >();
  for (const submission of gallerySubmissions) {
    const rows = presentationSourcesByAssignment.get(submission.assignmentId) ?? [];
    rows.push(submission);
    presentationSourcesByAssignment.set(submission.assignmentId, rows);
  }
  const revealStates = new Map(
    await Promise.all(
      galleryAssignmentIds.map(async (assignmentId) => [
        assignmentId,
        await isRevealed(assignmentId, sectionId),
      ] as const),
    ),
  );

  const artifacts: ArtifactSummary[] = assignments.map((a) => {
    const mine = latestByAssignment.get(a.id) ?? [];
    const totals = mine.map((s) => s.grades[0]?.total).filter((t): t is number => typeof t === "number");
    const revealed = revealStates.get(a.id) ?? false;
    return {
      assignmentId: a.id,
      title: a.title,
      slug: a.assignmentType.slug,
      aiGraded: a.assignmentType.aiGraded,
      galleryEligible: a.assignmentType.galleryEligible,
      submitted: mine.length,
      graded: totals.length,
      avgTotal: totals.length ? totals.reduce((x, y) => x + y, 0) / totals.length : null,
      revealed,
      presentationItems: a.assignmentType.galleryEligible
        ? buildGalleryPresentationItems({
            assignmentTypeSlug: a.assignmentType.slug,
            namesVisible: revealed,
            rows: (presentationSourcesByAssignment.get(a.id) ?? []).map((submission) => ({
                ...submission,
                ownerName: ownerNames.get(submission.userId) ?? "Unknown",
              })),
          })
        : [],
    };
  });

  return {
    sectionId: section.id,
    sectionCode: section.code,
    totalStudents: students.length,
    artifacts,
    students: rows,
  };
}
