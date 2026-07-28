import { prisma } from "@/lib/db";
import { parseValidations } from "@/lib/portfolio";
import { Card, Eyebrow } from "@/components/ui";
import { ValidationsForm, type StudentOption } from "./validations-form";

// U16 — the tiny instructor surface for recording portfolio validations
// (external company sign-offs, peer validations). v1: validations are
// instructor-entered only; there is no student "request validation" flow.
// Auth via the instructor layout (instructors + admins).

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const fmtAt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function ValidationsPage() {
  const [students, entries] = await Promise.all([
    prisma.user.findMany({
      where: { role: "student" },
      select: { id: true, name: true, email: true, section: { select: { code: true } } },
      orderBy: { email: "asc" },
    }),
    prisma.portfolioEntry.findMany({
      select: { userId: true, validations: true, user: { select: { name: true, email: true } } },
    }),
  ]);

  const options: StudentOption[] = students.map((s) => ({
    id: s.id,
    label: `${s.name} · ${s.email}${s.section ? ` · Sec ${s.section.code}` : ""}`,
  }));

  const recent = entries
    .flatMap((e) =>
      parseValidations(e.validations).map((v) => ({
        ...v,
        student: `${e.user.name} (${e.user.email})`,
      })),
    )
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 30);

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Instructor</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Portfolio validations</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6, maxWidth: "44rem" }}>
        Record an external (company) or peer validation against a student&apos;s portfolio.
        Each one feeds the validation sub-scores of the portfolio component and is
        audit-logged.
      </p>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        <ValidationsForm students={options} />

        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Recent validations</h2>
          {recent.length === 0 ? (
            <p style={{ color: "var(--charcoal)", margin: 0 }}>None recorded yet.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {recent.map((v, i) => (
                <li key={i} style={{ borderBottom: "1px solid var(--sand)", padding: "0.625rem 0" }}>
                  <p style={{ ...mono, fontSize: "0.625rem", color: v.kind === "external" ? "var(--pine)" : "var(--charcoal)", margin: "0 0 0.25rem" }}>
                    {v.kind} · {v.student} · by {v.by}
                    {v.at && ` · ${fmtAt.format(new Date(v.at))}`}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.9375rem" }}>{v.note}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
