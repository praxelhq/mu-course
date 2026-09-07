import Link from "next/link";
import { Card, Eyebrow } from "@/components/ui";

// Instructor home: index cards for the teaching tools. Most destinations
// arrive in later units — the links are stable, the pages come.

const TOOLS = [
  {
    href: "/instructor/session-8",
    title: "Session 8 · RAG + MCP",
    body: "Projector deck, live RAG lab, verified challenge files, answer reveal, and MCP handoff in one place.",
  },
  {
    href: "/instructor/unlocks",
    title: "Unlock Console",
    body: "Open sessions, materials, assignments and quizzes per section, live in class.",
  },
  {
    href: "/instructor/matrix",
    title: "Matrix",
    body: "Every student, every artifact — the whole cohort's state on one screen.",
  },
  {
    href: "/instructor/review",
    title: "Review Queue",
    body: "Low-confidence and flagged AI grades waiting for a human decision.",
  },
  {
    href: "/instructor/interviews",
    title: "Interviews",
    body: "Voice interview transcripts, scores, and escalations.",
  },
  {
    href: "/instructor/exports",
    title: "Exports",
    body: "Grade sheets and the Praxy artifact export.",
  },
];

export default function InstructorHomePage() {
  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Instructor</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Teaching tools</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Everything for running a session and keeping the grading honest.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
          gap: "1.5rem",
        }}
      >
        {TOOLS.map((t) => (
          <Card key={t.href}>
            <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>
              <Link href={t.href} style={{ textDecoration: "none" }}>
                {t.title}
              </Link>
            </h2>
            <p style={{ color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>{t.body}</p>
          </Card>
        ))}
      </div>
    </main>
  );
}
