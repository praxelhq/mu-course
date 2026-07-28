import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSectionMatrix } from "@/lib/matrix";
import { s3Configured } from "@/lib/s3";
import { Eyebrow } from "@/components/ui";
import { MatrixTable } from "./matrix-table";
import { SignoffPanel } from "./signoff-panel";

// Instructor section matrix: tabs A–H, 60 students × assignments,
// latest-version status chips from ONE batched query (lib/matrix), CSV
// export, and the per-team company sign-off editor.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export default async function MatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section: requested } = await searchParams;
  const sections = await prisma.section.findMany({ orderBy: { code: "asc" } });
  const active =
    sections.find((s) => s.code === (requested ?? "A")) ?? sections[0];
  if (!active) {
    return (
      <main style={{ padding: "3rem 2rem" }}>
        <p>No sections yet — import a roster first.</p>
      </main>
    );
  }
  const matrix = await getSectionMatrix(active.id);

  return (
    <main style={{ maxWidth: "80rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Instructor</Eyebrow>
      <h1 style={{ fontSize: "2rem", margin: "0 0 1.5rem" }}>Submission matrix</h1>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {sections.map((s) => (
          <Link
            key={s.id}
            href={`/instructor/matrix?section=${s.code}`}
            style={{
              ...mono,
              fontSize: "0.6875rem",
              textDecoration: "none",
              padding: "0.375rem 0.875rem",
              border: "1px solid var(--sand)",
              color: s.id === active.id ? "var(--cream)" : "var(--charcoal)",
              background: s.id === active.id ? "var(--pine)" : "var(--parchment)",
            }}
          >
            {s.code}
          </Link>
        ))}
      </div>

      <MatrixTable matrix={matrix} />

      <SignoffPanel
        teams={matrix.teams}
        storageReady={s3Configured()}
      />
    </main>
  );
}
