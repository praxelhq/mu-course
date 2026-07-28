import { prisma } from "@/lib/db";
import { resolveMany } from "@/lib/gates";
import { Eyebrow } from "@/components/ui";
import { UnlocksGrid, type ConsoleSection, type ConsoleSession } from "./unlocks-grid";

export const dynamic = "force-dynamic";

// The instructor's one-screen session remote control: rows are sessions 1–10
// (expandable to their materials/assignments/quizzes), columns are sections
// A–H, every cell a three-state gate toggle. Auth comes from the instructor
// layout; the grid itself is a client component with optimistic toggles and a
// 4s poll so two instructors see each other's flips.

export default async function UnlocksPage() {
  const [sections, sessionPages, materials, assignments, quizzes, snapshot] = await Promise.all([
    prisma.section.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } }),
    prisma.sessionPage.findMany({ orderBy: { sessionNo: "asc" } }),
    prisma.material.findMany({ select: { id: true, title: true } }),
    prisma.assignment.findMany({ select: { id: true, title: true } }),
    prisma.quiz.findMany({ select: { id: true, title: true } }),
    resolveMany(null),
  ]);

  const title = new Map<string, string>();
  for (const m of materials) title.set(m.id, m.title);
  for (const a of assignments) title.set(a.id, a.title);
  for (const q of quizzes) title.set(q.id, q.title);

  const sessions: ConsoleSession[] = sessionPages.map((p) => ({
    id: p.id,
    sessionNo: p.sessionNo,
    title: p.title,
    children: [
      ...p.orderedMaterialIds.map((id) => ({
        targetType: "material" as const,
        targetId: id,
        title: title.get(id) ?? id,
      })),
      ...p.linkedAssignmentIds.map((id) => ({
        targetType: "assignment" as const,
        targetId: id,
        title: title.get(id) ?? id,
      })),
      ...p.linkedQuizIds.map((id) => ({
        targetType: "quiz" as const,
        targetId: id,
        title: title.get(id) ?? id,
      })),
    ],
  }));

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Instructor</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Unlock Console</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Click a cell to cycle locked → open → closed. Expand a session for its
        materials, assignments and quizzes. Changes reach students within five
        seconds.
      </p>
      <UnlocksGrid
        sections={sections as ConsoleSection[]}
        sessions={sessions}
        initialGates={snapshot.rows}
        initialVersion={snapshot.version}
      />
    </main>
  );
}
