import { redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/dashboard";
import { Card, Eyebrow, StatusChip, Td, Th } from "@/components/ui";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const fmtDate = (d: Date | null) => (d ? dateFmt.format(d) : "No due date");

// Short mono tags for the per-dimension grade breakdown.
const DIM_SHORT: Record<string, string> = {
  functionality: "Fn",
  craft: "Cr",
  relevance: "Rel",
  "verification-evidence": "Ver",
};

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const cardTitle: React.CSSProperties = { fontSize: "1.125rem", margin: "0 0 1rem" };

export default async function StudentDashboardPage() {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }
  const d = await getStudentDashboard(userId);
  const firstName = d.user.name.split(" ")[0];

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Dashboard</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>
        The work in front of you, {firstName}
      </h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Open assignments, provisional grades, your interview window, and your team.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))", gap: "1.5rem" }}>
        {/* Open assignments — full width */}
        <Card style={{ gridColumn: "1 / -1" }}>
          <h2 style={cardTitle}>Open assignments</h2>
          {d.openAssignments.length === 0 ? (
            <p style={{ color: "var(--charcoal)", margin: 0 }}>
              Nothing is open for your section right now. New work unlocks in class.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>Assignment</Th>
                  <Th>Kind</Th>
                  <Th>Due</Th>
                  <Th style={{ textAlign: "right" }}>Your submission</Th>
                </tr>
              </thead>
              <tbody>
                {d.openAssignments.map((a) => (
                  <tr key={a.id}>
                    <Td>{a.title}</Td>
                    <Td style={{ color: "var(--charcoal)" }}>{a.typeTitle}</Td>
                    <Td style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.8125rem" }}>
                      {fmtDate(a.dueAt)}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      {a.submissionStatus ? (
                        <StatusChip status={a.submissionStatus} />
                      ) : (
                        <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)" }}>
                          Not started
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Provisional grades */}
        <Card>
          <h2 style={cardTitle}>Provisional grades</h2>
          {d.grades.length === 0 ? (
            <p style={{ color: "var(--charcoal)", margin: 0 }}>
              No grades yet. They appear here as your submissions are graded.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {d.grades.map((g) => (
                <li
                  key={g.submissionId}
                  style={{ borderBottom: "1px solid var(--sand)", padding: "0.75rem 0" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
                    <span style={{ fontWeight: 500 }}>{g.assignmentTitle}</span>
                    <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "1.25rem", color: "var(--pine)" }}>
                      {g.total}
                      <span style={{ fontSize: "0.75rem", color: "var(--clay)" }}>/40</span>
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "1rem", marginTop: "0.375rem", alignItems: "baseline" }}>
                    {g.dimensions.map((dim) => (
                      <span key={dim.key} style={{ ...mono, fontSize: "0.6875rem", color: "var(--charcoal)" }}>
                        {DIM_SHORT[dim.key] ?? dim.key} {dim.score}
                      </span>
                    ))}
                    {g.provisional && (
                      <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", marginLeft: "auto" }}>
                        Provisional
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Interview */}
        <Card>
          <h2 style={cardTitle}>Your interview</h2>
          {d.interview.window ? (
            <>
              <p style={{ margin: "0 0 0.5rem", color: "var(--charcoal)", lineHeight: 1.6 }}>
                {d.interview.window.label}
              </p>
              <p style={{ margin: "0 0 0.75rem", fontFamily: "var(--font-geist-mono)", fontSize: "0.875rem" }}>
                {fmtDate(d.interview.window.opensAt)} — {fmtDate(d.interview.window.closesAt)}
              </p>
            </>
          ) : (
            <p style={{ margin: "0 0 0.75rem", color: "var(--charcoal)" }}>
              No interview window is scheduled for your section yet.
            </p>
          )}
          {d.interview.status ? (
            <StatusChip status={d.interview.status} />
          ) : (
            <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)" }}>
              Not taken yet
            </span>
          )}
        </Card>

        {/* Team */}
        <Card>
          <h2 style={cardTitle}>Your team</h2>
          {d.team ? (
            <>
              <p style={{ margin: "0 0 0.25rem", fontWeight: 500 }}>{d.team.name}</p>
              <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--charcoal)", margin: "0 0 0.75rem" }}>
                {d.team.sectorName}
              </p>
              <p style={{ margin: 0, color: "var(--charcoal)", lineHeight: 1.7 }}>
                {d.team.members.join(" · ")}
              </p>
            </>
          ) : (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>
              You are not on a team yet. Teams form in Session 1.
            </p>
          )}
        </Card>

        {/* Notifications */}
        <Card style={{ gridColumn: "1 / -1" }}>
          <h2 style={cardTitle}>Notifications</h2>
          {d.unreadNotifications.length === 0 ? (
            <p style={{ color: "var(--charcoal)", margin: 0 }}>Nothing unread.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {d.unreadNotifications.map((n) => (
                <li
                  key={n.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    borderBottom: "1px solid var(--sand)",
                    padding: "0.75rem 0",
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{n.title}</p>
                    {n.body && (
                      <p style={{ margin: "0.25rem 0 0", color: "var(--charcoal)", lineHeight: 1.5 }}>
                        {n.body}
                      </p>
                    )}
                  </div>
                  <form method="post" action="/api/notifications/read">
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" style={markReadButton}>
                      Mark read
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}

const markReadButton: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.6875rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  background: "var(--parchment)",
  color: "var(--pine)",
  border: "1px solid var(--sand)",
  padding: "0.375rem 0.75rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

