import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseSubmissionSchema } from "@/lib/submission-schema";
import { presignGet, s3Configured } from "@/lib/s3";
import { Card, Eyebrow, StatusChip } from "@/components/ui";
import { Markdown } from "@/components/markdown";

// Full submission detail for instructor review: every field, files
// (presigned GET links, gracefully disabled when storage is unconfigured),
// the version history, each grade with its promptLog viewer, and the
// AuditLog trail. Instructor-scoped by the /instructor layout
// (requireRole('instructor')) — students can never reach this route, so the
// promptLog is safe to show here and ONLY here.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const pre: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.75rem",
  lineHeight: 1.6,
  background: "var(--parchment)",
  border: "1px solid var(--sand)",
  padding: "0.75rem",
  margin: "0.5rem 0 0",
  whiteSpace: "pre-wrap",
  overflowX: "auto",
  maxHeight: "24rem",
  overflowY: "auto",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join(", ");
  return JSON.stringify(value);
}

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      assignment: { include: { assignmentType: true } },
      user: { include: { section: true } },
      team: true,
      grades: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!submission) notFound();

  const schema = parseSubmissionSchema(submission.assignment.assignmentType.submissionSchema);
  const fields = (submission.fields ?? {}) as Record<string, unknown>;
  const fieldKeys = schema ? schema.fields.map((f) => f.key) : Object.keys(fields);

  // Version history: every submission of the same owner for this assignment.
  const versions = await prisma.submission.findMany({
    where: {
      assignmentId: submission.assignmentId,
      ...(submission.teamId ? { teamId: submission.teamId } : { userId: submission.userId }),
    },
    select: { id: true, version: true, status: true, submittedAt: true },
    orderBy: { version: "desc" },
  });

  // Audit trail: rows touching this submission or any of its grades.
  const gradeIds = submission.grades.map((g) => g.id);
  const audit = await prisma.auditLog.findMany({
    where: {
      OR: [
        { targetType: "submission", targetId: submission.id },
        ...(gradeIds.length > 0 ? [{ targetType: "grade", targetId: { in: gradeIds } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  // Presigned file links (5-min TTL) — disabled state when S3 is not set up.
  const storageReady = s3Configured();
  const fileLinks: { key: string; url: string | null }[] = await Promise.all(
    submission.files.map(async (key) => {
      if (!storageReady) return { key, url: null };
      try {
        return { key, url: await presignGet(key, { downloadName: key.split("/").pop() }) };
      } catch {
        return { key, url: null };
      }
    }),
  );

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Instructor · Submission review</Eyebrow>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "1rem", margin: "0 0 0.5rem" }}>
        <h1 style={{ fontSize: "2rem", margin: 0 }}>{submission.assignment.title}</h1>
        <StatusChip status={submission.status} />
      </div>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        {submission.user.name}
        {submission.user.section ? ` · Sec ${submission.user.section.code}` : ""}
        {submission.team ? ` · ${submission.team.name}` : ""} ·{" "}
        {submission.assignment.assignmentType.title} · version {submission.version}
        {submission.submittedAt ? ` · submitted ${dateFmt.format(submission.submittedAt)}` : " · not submitted"}
      </p>
      <p style={{ margin: "0 0 1.5rem" }}>
        <Link href="/instructor/review" style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)" }}>
          ← Review queue
        </Link>
      </p>

      <div style={{ display: "grid", gap: "1.5rem" }}>
        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Submitted fields</h2>
          {fieldKeys.length === 0 ? (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>No fields.</p>
          ) : (
            <dl style={{ margin: 0 }}>
              {fieldKeys.map((key) => {
                const def = schema?.fields.find((f) => f.key === key);
                const value = fields[key];
                if (value === undefined || value === null || value === "") return null;
                const text = asText(value);
                const isUrl = def?.kind === "link" && /^https?:\/\//.test(text);
                return (
                  <div key={key} style={{ borderTop: "1px solid var(--sand)", padding: "0.625rem 0" }}>
                    <dt style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", marginBottom: "0.25rem" }}>
                      {def?.label ?? key}
                    </dt>
                    <dd style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                      {isUrl ? (
                        <a href={text} target="_blank" rel="noreferrer" style={{ color: "var(--pine)" }}>
                          {text}
                        </a>
                      ) : (
                        text
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </Card>

        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Files</h2>
          {fileLinks.length === 0 ? (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>No files attached.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {fileLinks.map((f) => (
                <li key={f.key} style={{ borderTop: "1px solid var(--sand)", padding: "0.5rem 0", display: "flex", gap: "1rem", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.8125rem", overflowWrap: "anywhere" }}>
                    {f.key}
                  </span>
                  {f.url ? (
                    <a href={f.url} style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)", marginLeft: "auto", whiteSpace: "nowrap" }}>
                      Download
                    </a>
                  ) : (
                    <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", marginLeft: "auto", whiteSpace: "nowrap" }}>
                      Storage not configured
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Version history</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {versions.map((v) => (
              <li key={v.id} style={{ borderTop: "1px solid var(--sand)", padding: "0.5rem 0", display: "flex", gap: "1rem", alignItems: "baseline" }}>
                <span style={{ ...mono, fontSize: "0.6875rem", color: v.id === submission.id ? "var(--ochre)" : "var(--charcoal)" }}>
                  v{v.version}
                  {v.id === submission.id ? " · viewing" : ""}
                </span>
                <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.8125rem", color: "var(--charcoal)" }}>
                  {v.submittedAt ? dateFmt.format(v.submittedAt) : "not submitted"}
                </span>
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: "0.75rem", alignItems: "baseline" }}>
                  <StatusChip status={v.status} />
                  {v.id !== submission.id && (
                    <Link href={`/instructor/submissions/${v.id}`} style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)" }}>
                      View
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Grades</h2>
          {submission.grades.length === 0 ? (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>Not graded yet.</p>
          ) : (
            submission.grades.map((g) => {
              const scores = (g.rubricScores ?? {}) as Record<
                string,
                { score?: number; rationale?: string }
              >;
              const promptLog = g.promptLog as {
                system?: string;
                user?: string;
                response?: string;
              } | null;
              return (
                <div key={g.id} style={{ borderTop: "1px solid var(--sand)", padding: "1rem 0" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "baseline" }}>
                    <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: "1.25rem", color: "var(--pine)" }}>
                      {g.total}
                    </span>
                    <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
                      conf {g.confidence.toFixed(2)} · by {g.gradedBy}
                      {g.provisional ? " · provisional" : " · final"}
                    </span>
                    {g.flags.map((flag) => (
                      <span key={flag} style={{ ...mono, fontSize: "0.625rem", color: "#8a3b1c", border: "1px solid #8a3b1c", padding: "0.125rem 0.5rem" }}>
                        {flag}
                      </span>
                    ))}
                    <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", marginLeft: "auto" }}>
                      {dateFmt.format(g.createdAt)}
                    </span>
                  </div>
                  {g.overriddenBy && (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "#8a6a1c" }}>
                      Overridden by {g.overriddenBy}: {g.overrideReason}
                    </p>
                  )}
                  <table style={{ borderCollapse: "collapse", margin: "0.75rem 0", width: "100%" }}>
                    <tbody>
                      {Object.entries(scores).map(([key, v]) => (
                        <tr key={key}>
                          <td style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)", padding: "0.25rem 1rem 0.25rem 0", whiteSpace: "nowrap", verticalAlign: "top" }}>
                            {key} {v.score ?? "—"}
                          </td>
                          <td style={{ fontSize: "0.8125rem", color: "var(--charcoal)", padding: "0.25rem 0", lineHeight: 1.5 }}>
                            {v.rationale ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
                    <Markdown>{g.feedbackMd}</Markdown>
                  </div>
                  {promptLog && (
                    <details>
                      <summary style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)", cursor: "pointer" }}>
                        Prompt log (system / user / response)
                      </summary>
                      <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.75rem 0 0" }}>System</p>
                      <pre style={pre}>{promptLog.system ?? "—"}</pre>
                      <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.75rem 0 0" }}>User</p>
                      <pre style={pre}>{promptLog.user ?? "—"}</pre>
                      <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.75rem 0 0" }}>Response</p>
                      <pre style={pre}>
                        {typeof promptLog.response === "string"
                          ? promptLog.response
                          : JSON.stringify(g.promptLog, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })
          )}
        </Card>

        <Card>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Audit trail</h2>
          {audit.length === 0 ? (
            <p style={{ margin: 0, color: "var(--charcoal)" }}>No audit entries for this submission.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {audit.map((a) => (
                <li key={a.id} style={{ borderTop: "1px solid var(--sand)", padding: "0.625rem 0" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "baseline" }}>
                    <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--ink)" }}>{a.action}</span>
                    <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
                      {a.targetType} {a.targetId}
                    </span>
                    <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>
                      by {a.actorId ?? "system"}
                    </span>
                    <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", marginLeft: "auto" }}>
                      {dateFmt.format(a.createdAt)}
                    </span>
                  </div>
                  {(a.before !== null || a.after !== null) && (
                    <details>
                      <summary style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)", cursor: "pointer", marginTop: "0.25rem" }}>
                        before / after
                      </summary>
                      <pre style={pre}>
                        {JSON.stringify({ before: a.before, after: a.after }, null, 2)}
                      </pre>
                    </details>
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
