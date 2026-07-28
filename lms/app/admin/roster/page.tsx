import { redirect } from "next/navigation";
import { AuthError, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, Eyebrow, Td, Th } from "@/components/ui";
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
              <Th>Section</Th>
              <Th style={{ textAlign: "right" }}>Students</Th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.id}>
                <Td style={{ padding: "0.625rem 0" }}>{s.name}</Td>
                <Td style={{ padding: "0.625rem 0", textAlign: "right", fontFamily: "var(--font-geist-mono)" }}>
                  {studentCount(s.id)}
                </Td>
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

