import { prisma } from "@/lib/db";
import { resolveMany } from "@/lib/gates";
import { getQuizResults, listQuizzesForInstructor } from "@/lib/quizzes/instructor";
import { Eyebrow } from "@/components/ui";
import { QuizzesPanel, type PanelQuiz, type PanelSection } from "./quizzes-panel";

export const dynamic = "force-dynamic";

// The instructor quiz console: create quizzes, arm/disarm them per section
// (a plain gate flip — students' hub pages pick it up via the 4s gate poll),
// and read results. This page imports lib/quizzes/instructor — the ONLY place
// diagnostic data is visible.

export default async function InstructorQuizzesPage() {
  const [sections, quizzes, snapshot] = await Promise.all([
    prisma.section.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } }),
    listQuizzesForInstructor(),
    resolveMany(null),
  ]);

  const gateState = new Map<string, "locked" | "open" | "closed">();
  for (const r of snapshot.rows) {
    if (r.targetType === "quiz") gateState.set(`${r.targetId}|${r.sectionId}`, r.state);
  }

  const panelQuizzes: PanelQuiz[] = await Promise.all(
    quizzes.map(async (q) => {
      const results = await getQuizResults(q.id);
      return {
        ...q,
        classificationFinalizedAt: q.classificationFinalizedAt?.toISOString() ?? null,
        feedbackReleaseAt: q.feedbackReleaseAt?.toISOString() ?? null,
        publishedAt: q.publishedAt?.toISOString() ?? null,
        gates: Object.fromEntries(
          sections.map((s) => [s.id, gateState.get(`${q.id}|${s.id}`) ?? "locked"]),
        ),
        results: results
          ? {
              questions: results.questions.map((question) => question.q),
              perSection: results.perSection,
            }
          : null,
      };
    }),
  );

  const panelSections: PanelSection[] = sections;

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Instructor</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Quizzes</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6, maxWidth: "48rem" }}>
        Arm a quiz for a section to make it live on that section&apos;s session hub
        (within ~5 seconds); disarm to close it. A quiz is only reachable by students
        while its parent session is also open. Closing still accepts in-flight
        submissions for a two-minute grace window. Imported versioned quizzes must be
        classified and published before any section can arm them.
      </p>
      <QuizzesPanel quizzes={panelQuizzes} sections={panelSections} />
    </main>
  );
}
