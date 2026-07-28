import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getSessionHub } from "@/lib/materials";
import { Card, Eyebrow, StatusChip } from "@/components/ui";
import { GatePollMount } from "@/components/gate-poll-mount";
import { MaterialPreview } from "@/components/material-preview";
import { s3Configured } from "@/lib/s3";

// The session hub — the single in-class surface. A locked session renders the
// locked card ONLY, even on direct URL access: getSessionHub returns nothing
// beyond the title, so locked material metadata never enters the HTML. The
// gate poll refreshes the page the moment the instructor drops a gate.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

function fmtSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const actionLink: React.CSSProperties = {
  ...mono,
  fontSize: "0.6875rem",
  color: "var(--cream)",
  background: "var(--pine)",
  border: "1px solid var(--pine)",
  padding: "0.375rem 0.75rem",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const quietLink: React.CSSProperties = {
  ...mono,
  fontSize: "0.6875rem",
  color: "var(--pine)",
  background: "var(--parchment)",
  border: "1px solid var(--sand)",
  padding: "0.375rem 0.75rem",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

export default async function SessionHubPage({
  params,
}: {
  params: Promise<{ no: string }>;
}) {
  const { no } = await params;
  const sessionNo = Number(no);
  if (!Number.isInteger(sessionNo) || sessionNo < 1 || sessionNo > 10) notFound();

  let userId: string, sectionId: string | null;
  try {
    const user = await requireUser();
    userId = user.userId;
    sectionId = user.sectionId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const hub = await getSessionHub(userId, sessionNo);
  if (!hub) notFound();
  const storageReady = s3Configured();

  if (hub.locked) {
    // Locked card only — title + lock, nothing else in the HTML.
    return (
      <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 2rem" }}>
        <GatePollMount sectionId={sectionId ?? undefined} />
        <Card style={{ textAlign: "center", padding: "3rem 2rem", opacity: 0.75 }}>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
            Session {hub.sessionNo} · Locked
          </p>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem", color: "var(--charcoal)" }}>
            {hub.title}
          </h1>
          <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: 0 }}>
            This session opens in class. This page updates itself the moment it does.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <GatePollMount sectionId={sectionId ?? undefined} />
      <Eyebrow muted>Session {hub.sessionNo}</Eyebrow>
      <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>{hub.title}</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6, maxWidth: "48rem" }}>
        {hub.summaryMd.replace(/\*\*/g, "")}
      </p>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        {/* Materials */}
        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Materials</h2>
          {!storageReady && hub.materials.some((m) => m.hasFile) && (
            <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
              File storage is not configured in this environment — downloads are disabled.
            </p>
          )}
          {hub.materials.length === 0 ? (
            <p style={{ color: "var(--charcoal)", margin: 0 }}>No materials for this session.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {hub.materials.map((m) => (
                <li
                  key={m.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: "1rem",
                    borderBottom: "1px solid var(--sand)",
                    padding: "0.75rem 0",
                    opacity: m.available ? 1 : 0.55,
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontWeight: 500, color: m.available ? "var(--ink)" : "var(--charcoal)" }}>
                      {m.title}
                    </p>
                    <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.25rem 0 0" }}>
                      {m.kind}
                      {m.sizeBytes !== null && ` · ${fmtSize(m.sizeBytes)}`}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {!m.available ? (
                      <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)" }}>
                        Not yet released
                      </span>
                    ) : m.externalUrl ? (
                      <a href={m.externalUrl} target="_blank" rel="noopener noreferrer" style={actionLink}>
                        Launch ↗
                      </a>
                    ) : m.hasFile ? (
                      <>
                        {m.previewable && <MaterialPreview materialId={m.id} title={m.title} />}
                        {storageReady ? (
                          <a href={`/api/materials/${m.id}/download`} style={actionLink}>
                            Download
                          </a>
                        ) : (
                          <span
                            title="Storage not configured"
                            style={{ ...actionLink, background: "var(--clay)", border: "1px solid var(--clay)", cursor: "default" }}
                          >
                            Download
                          </span>
                        )}
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Assignments */}
        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Assignments</h2>
          {hub.assignments.length === 0 ? (
            <p style={{ color: "var(--charcoal)", margin: 0 }}>No assignments in this session.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {hub.assignments.map((a) => (
                <li
                  key={a.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    gap: "1rem",
                    borderBottom: "1px solid var(--sand)",
                    padding: "0.75rem 0",
                    opacity: a.available ? 1 : 0.55,
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
                  {a.available ? (
                    <Link href={`/assignments/${a.id}/submit`} style={quietLink}>
                      Submit
                    </Link>
                  ) : (
                    <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)" }}>
                      Not yet open
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Quiz slot */}
        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Quiz</h2>
          {hub.quizzes.length === 0 ? (
            <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: 0 }}>
              No quiz armed for this session.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {hub.quizzes.map((q) => (
                <li
                  key={q.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.5rem 0",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 500 }}>{q.title}</p>
                  {q.armed ? (
                    <Link href={`/quiz/${q.id}`} style={actionLink}>
                      Start quiz
                    </Link>
                  ) : (
                    <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)" }}>
                      No quiz armed
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
