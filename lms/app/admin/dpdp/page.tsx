import { prisma } from "@/lib/db";
import { Card, Eyebrow } from "@/components/ui";
import { DeleteStudentForm } from "./delete-form";

// The DPDP admin surface: find a student by email, export everything
// the LMS holds about them (JSON bundle), or erase them entirely (typed
// email confirmation; audited). Admin-only via the admin layout.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export default async function DpdpPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const matches = query
    ? await prisma.user.findMany({
        where: {
          role: "student",
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          section: { select: { code: true } },
          _count: { select: { submissions: true, interviews: true, quizAttempts: true } },
        },
        orderBy: { email: "asc" },
        take: 20,
      })
    : [];

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Admin</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Data protection (DPDP)</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6, maxWidth: "44rem" }}>
        Fulfil a student&apos;s data-access or erasure request. Export downloads one JSON
        bundle of everything the LMS holds about them; delete removes every row in one
        transaction and keeps only the audit record of the deletion.
      </p>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        <Card>
          <form method="get" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by email or name…"
              style={{
                fontFamily: "var(--font-geist-sans)",
                fontSize: "0.9375rem",
                border: "1px solid var(--sand)",
                background: "var(--parchment)",
                padding: "0.5rem 0.75rem",
                color: "var(--ink)",
                flex: 1,
                minWidth: "16rem",
              }}
            />
            <button
              type="submit"
              style={{
                ...mono,
                fontSize: "0.6875rem",
                background: "var(--pine)",
                color: "var(--cream)",
                border: "1px solid var(--pine)",
                padding: "0.5rem 1rem",
                cursor: "pointer",
              }}
            >
              Search
            </button>
          </form>
        </Card>

        {query &&
          (matches.length === 0 ? (
            <Card>
              <p style={{ margin: 0, color: "var(--charcoal)" }}>
                No students match &ldquo;{query}&rdquo;.
              </p>
            </Card>
          ) : (
            matches.map((m) => (
              <Card key={m.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "baseline" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{m.name}</p>
                    <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.25rem 0 0" }}>
                      {m.email}
                      {m.section && ` · Sec ${m.section.code}`} · {m._count.submissions} submissions ·{" "}
                      {m._count.interviews} interviews · {m._count.quizAttempts} quiz attempts
                    </p>
                  </div>
                  <a
                    href={`/api/admin/dpdp/export?userId=${m.id}`}
                    download
                    style={{
                      ...mono,
                      fontSize: "0.6875rem",
                      color: "var(--pine)",
                      border: "1px solid var(--pine)",
                      padding: "0.375rem 0.75rem",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Export all data
                  </a>
                </div>
                <DeleteStudentForm userId={m.id} email={m.email} />
              </Card>
            ))
          ))}
      </div>
    </main>
  );
}
