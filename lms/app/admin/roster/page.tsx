import { redirect } from "next/navigation";
import { AuthError, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";
import { RosterUploader } from "./uploader";

export const dynamic = "force-dynamic";

export default async function AdminRosterPage() {
  try {
    await requireRole("admin");
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const sections = await prisma.section.findMany({ orderBy: { code: "asc" } });
  const counts = await prisma.user.groupBy({
    by: ["sectionId", "role"],
    _count: { _all: true },
  });
  const studentCount = (sectionId: string) =>
    counts.find((c) => c.sectionId === sectionId && c.role === "student")?._count._all ?? 0;
  const total = counts
    .filter((c) => c.role === "student")
    .reduce((a, c) => a + c._count._all, 0);

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 2rem" }}>
      {/* muted: the shell's active nav link is this view's Ochre accent */}
      <Eyebrow muted>Admin · Roster</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Roster import</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        {total} students on the roster across {sections.length} sections.
      </p>

      <Card style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Current roster</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Section</th>
              <th style={{ ...th, textAlign: "right" }}>Students</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.id}>
                <td style={td}>{s.name}</td>
                <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-geist-mono)" }}>
                  {studentCount(s.id)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Import CSV</h2>
        <RosterUploader />
      </Card>
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid var(--sand)",
  padding: "0.5rem 0",
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--clay)",
  fontWeight: 400,
};

const td: React.CSSProperties = {
  borderBottom: "1px solid var(--sand)",
  padding: "0.625rem 0",
};
