import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/dashboard";
import { Card, Eyebrow, StatusChip } from "@/components/ui";

// Simple list of my open assignments (reuses the dashboard data helper)
// so the /assignments URLs have a home surface.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export default async function AssignmentsPage() {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const dashboard = await getStudentDashboard(userId);

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Assignments</Eyebrow>
      <h1 style={{ fontSize: "2rem", margin: "0 0 2rem" }}>Open assignments</h1>
      <Card>
        {dashboard.openAssignments.length === 0 ? (
          <p style={{ color: "var(--charcoal)", margin: 0 }}>
            Nothing is open right now. Assignments unlock in class.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {dashboard.openAssignments.map((a) => (
              <li
                key={a.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  alignItems: "center",
                  gap: "1rem",
                  borderBottom: "1px solid var(--sand)",
                  padding: "0.75rem 0",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>{a.title}</p>
                  <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.25rem 0 0" }}>
                    {a.typeTitle}
                    {a.dueAt && ` · due ${dateFmt.format(a.dueAt)}`}
                  </p>
                </div>
                {a.submissionStatus ? (
                  <StatusChip status={a.submissionStatus} />
                ) : (
                  <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)" }}>
                    Not started
                  </span>
                )}
                <Link
                  href={`/assignments/${a.id}/submit`}
                  style={{
                    ...mono,
                    fontSize: "0.6875rem",
                    color: "var(--pine)",
                    border: "1px solid var(--sand)",
                    padding: "0.375rem 0.75rem",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
