import Link from "next/link";
import { Card, Eyebrow } from "@/components/ui";

// Admin home: index cards for course administration. The instructor tools
// are reachable from the nav; these are the admin-only surfaces. Most
// destinations arrive in later units.

const TOOLS = [
  {
    href: "/admin/roster",
    title: "Roster",
    body: "Import the course roster from CSV and see section headcounts.",
  },
  {
    href: "/admin/types",
    title: "Types",
    body: "Assignment types: submission schemas and rubrics, editable without a deploy.",
  },
  {
    href: "/admin/costs",
    title: "Costs",
    body: "AI spend by feature and provider — grading, interviews, crawls.",
  },
  {
    href: "/admin/dpdp",
    title: "DPDP",
    body: "Data protection: deletion flags, consent records, and audit trails.",
  },
];

export default function AdminHomePage() {
  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Admin</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Course administration</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Roster, artifact types, spend, and data protection. Teaching tools live
        in the nav above.
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
