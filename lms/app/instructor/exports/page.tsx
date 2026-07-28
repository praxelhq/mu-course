import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";

// Instructor export hub: every CSV the LMS produces, in one place.
// Grades/PCI stay inside the LMS (never Praxy) — these downloads are
// instructor-only, enforced by the routes themselves.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const linkStyle: React.CSSProperties = {
  ...mono,
  fontSize: "0.6875rem",
  color: "var(--pine)",
  border: "1px solid var(--pine)",
  padding: "0.375rem 0.75rem",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

function ExportCard({
  title,
  description,
  links,
}: {
  title: string;
  description: string;
  links: { label: string; href: string }[];
}) {
  return (
    <Card>
      <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.375rem" }}>{title}</h2>
      <p style={{ color: "var(--charcoal)", margin: "0 0 1rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
        {description}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {links.map((l) => (
          <a key={l.href} href={l.href} style={linkStyle} download>
            {l.label}
          </a>
        ))}
      </div>
    </Card>
  );
}

export default async function ExportsPage() {
  const sections = await prisma.section.findMany({ orderBy: { code: "asc" }, select: { code: true } });

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Exports</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>CSV exports</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6, maxWidth: "44rem" }}>
        Everything downloads as formula-injection-safe CSV. Grades and PCI values never
        leave the LMS except through these instructor-only exports — the Praxy pipeline
        carries artifacts and validations only.
      </p>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        <ExportCard
          title="Grade lines"
          description="Per student: all seven component raw scores, the combined PCI, the weighted total, and which components are still pending. Section exports are fast; the full cohort takes noticeably longer."
          links={[
            { label: "Full cohort", href: "/api/exports/grades" },
            ...sections.map((s) => ({ label: `Section ${s.code}`, href: `/api/exports/grades?section=${s.code}` })),
          ]}
        />
        <ExportCard
          title="Peer reviews"
          description="The raw survey data: one row per (checkpoint, reviewer, reviewee) with the point allocation and the reliability / communication / helpfulness ratings."
          links={[{ label: "peer_reviews.csv", href: "/api/exports/peer" }]}
        />
        <ExportCard
          title="Interviews"
          description="Every interview attempt with its status, the four rubric category scores, grading confidence, and the escalation reason where one was raised."
          links={[{ label: "interviews.csv", href: "/api/exports/interviews" }]}
        />
        <ExportCard
          title="Section matrix"
          description="The submission matrix per section: one row per student, one column per assignment, latest-version status in each cell."
          links={sections.map((s) => ({ label: `Section ${s.code}`, href: `/api/exports/matrix?section=${s.code}` }))}
        />
      </div>
    </main>
  );
}
