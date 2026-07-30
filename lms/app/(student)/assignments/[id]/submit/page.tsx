import { notFound, redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getAssignmentForStudent } from "@/lib/submissions";
import { getLearnerAssignmentProjection } from "@/lib/assessment-projections";
import { s3Configured } from "@/lib/s3";
import { Card, Eyebrow } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { SubmissionForm, type HistoryRow } from "@/components/submission-form";
import { LearnerAssessmentStatus } from "@/components/learner-assessment-status";
import { LearnerAssessmentActions } from "@/components/learner-assessment-actions";

// The submit surface. The form renders from the assignment type's
// submissionSchema (schema-driven; new types need zero code changes). A
// closed/locked gate renders the branded closed card; the API re-enforces
// the gate on the actual mutation (409 on the race).

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

export default async function SubmitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const [view, assessmentProjection] = await Promise.all([
    getAssignmentForStudent(userId, id),
    getLearnerAssignmentProjection({ userId, assignmentId: id }),
  ]);
  if (!view) notFound();

  const history: HistoryRow[] = view.history.map((h) => ({
    id: h.id,
    version: h.version,
    attempt: h.attempt,
    status: h.status,
    submittedAt: h.submittedAt?.toISOString() ?? null,
  }));

  const scoreableItem = assessmentProjection?.history.find(
    (item) => item.submissionId === assessmentProjection.latestScoreableId,
  );
  const publicationItem = assessmentProjection?.history.find(
    (item) => item.lifecycle !== "draft" && item.publication !== null,
  );
  const workflowItem = assessmentProjection?.history.find((item) => {
    const nominated = assessmentProjection.workflow.nominations.some(
      (nomination) => nomination.submissionId === item.submissionId,
    );
    return (
      item.workflowNominationEligible ||
      nominated ||
      assessmentProjection.workflow.selectedSubmissionId === item.submissionId
    );
  });

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>
        {view.type.title}
        {view.type.teamBased && " · Team submission"}
      </Eyebrow>
      <h1 style={{ fontSize: "2rem", margin: "0 0 0.5rem" }}>{view.assignment.title}</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 0.5rem", lineHeight: 1.6 }}>
        {view.assignment.brief}
      </p>
      {view.assignment.dueAt && (
        <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0 0 2rem" }}>
          Due {dateFmt.format(view.assignment.dueAt)}
        </p>
      )}

      {assessmentProjection?.assignment.contractMode === "versioned" && (
        <LearnerAssessmentStatus
          projection={assessmentProjection}
          available={view.available}
          canSubmit={view.canSubmit}
        />
      )}

      {/* What you submitted — visible as soon as anything exists. */}
      {view.submitted && (
        <Card style={{ marginBottom: "1.5rem" }}>
          <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
            Your submission
            {view.submitted.submittedAt && ` · ${dateFmt.format(view.submitted.submittedAt)}`}
          </p>
          {view.schema?.fields.map((f) => {
            const files = view.submitted!.fileUrls.filter((u) => u.field === f.key);
            if (files.length > 0) {
              return (
                <div key={f.key} style={{ marginBottom: "0.9rem" }}>
                  <p style={{ ...mono, fontSize: "0.6rem", color: "var(--clay)", margin: "0 0 0.35rem" }}>
                    {f.label}
                  </p>
                  {files.map((u) =>
                    u.url ? (
                      <a
                        key={u.key}
                        href={u.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--pine)", fontSize: "0.9rem", display: "block" }}
                      >
                        Open your file ↗
                      </a>
                    ) : (
                      <span key={u.key} style={{ fontSize: "0.85rem", color: "var(--clay)" }}>
                        (file attached)
                      </span>
                    ),
                  )}
                </div>
              );
            }
            const value = view.submitted!.fields[f.key];
            if (typeof value !== "string" || value.trim() === "") return null;
            return (
              <div key={f.key} style={{ marginBottom: "0.9rem" }}>
                <p style={{ ...mono, fontSize: "0.6rem", color: "var(--clay)", margin: "0 0 0.35rem" }}>
                  {f.label}
                </p>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{value}</p>
              </div>
            );
          })}
          {view.galleryEligible && (
            <a
              href={`/vote/${view.assignment.id}`}
              style={{
                ...mono,
                display: "inline-block",
                marginTop: "0.5rem",
                padding: "0.5rem 0.9rem",
                fontSize: "0.65rem",
                border: "1px solid var(--sand)",
                color: "var(--pine)",
                textDecoration: "none",
              }}
            >
              Open the gallery &amp; vote →
            </a>
          )}
        </Card>
      )}

      {/* The AI grade + feedback, once it lands. */}
      {view.grade && (
        <Card style={{ marginBottom: "1.5rem" }}>
          <p style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", margin: "0 0 0.5rem" }}>
            Your grade{view.grade.provisional && " · provisional"}
          </p>
          <p style={{ fontSize: "2rem", margin: "0 0 1rem" }}>
            {view.grade.total.toFixed(1)}
            <span style={{ fontSize: "1rem", color: "var(--clay)" }}>
              {" "}
              / {view.grade.dimensions.reduce((s, d) => s + d.max, 0)}
            </span>
          </p>
          {view.grade.provisional && (
            <p style={{ color: "var(--charcoal)", margin: "-0.5rem 0 1rem", lineHeight: 1.6 }}>
              This result is provisional. It is not final while instructor review, an open hold,
              or an appeal is unresolved.
            </p>
          )}
          {view.grade.dimensions.map((d) => (
            <div key={d.key} style={{ marginBottom: "0.75rem" }}>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>
                <strong>{d.label}</strong> — {d.score}/{d.max}
              </p>
              {d.rationale && (
                <p style={{ margin: "0.15rem 0 0", color: "var(--charcoal)", fontSize: "0.85rem", lineHeight: 1.55 }}>
                  {d.rationale}
                </p>
              )}
            </div>
          ))}
          {view.grade.feedbackMd && (
            <div style={{ marginTop: "1rem" }}>
              <Markdown>{view.grade.feedbackMd}</Markdown>
            </div>
          )}
        </Card>
      )}

      {assessmentProjection?.assignment.contractMode === "versioned" && (
        <LearnerAssessmentActions
          appeal={
            scoreableItem?.latestGrade
              ? {
                  gradeId: scoreableItem.latestGrade.gradeId,
                  gradeState: scoreableItem.latestGrade.state,
                  appeals: scoreableItem.latestGrade.appeals,
                }
              : null
          }
          publication={
            publicationItem?.publication
              ? { submissionId: publicationItem.submissionId, state: publicationItem.publication }
              : null
          }
          workflow={
            workflowItem
              ? {
                  assignmentId: view.assignment.id,
                  submissionId: workflowItem.submissionId,
                  eligible: workflowItem.workflowNominationEligible,
                  selected:
                    assessmentProjection.workflow.selectedSubmissionId === workflowItem.submissionId,
                  nominations: assessmentProjection.workflow.nominations.filter(
                    (nomination) => nomination.submissionId === workflowItem.submissionId,
                  ),
                }
              : null
          }
        />
      )}

      {!view.canSubmit && view.submitted ? (
        <Card style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.5rem" }}>
            Submitted
          </p>
          <p style={{ color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>
            {assessmentProjection?.assignment.contractMode === "versioned"
              ? "Your receipt is immutable and there is no eligible unused revision grant. An improvement or repair form appears here only while its one-use grant is active."
              : "One submission per student — yours is in. If you need to change it, ask your instructor to reopen this artifact for you."}
          </p>
        </Card>
      ) : !view.available ? (
        <Card style={{ textAlign: "center", padding: "3rem 2rem", opacity: 0.8 }}>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
            Submissions closed
          </p>
          <h2 style={{ fontSize: "1.375rem", margin: "0 0 0.75rem" }}>
            The Forge is not taking this piece right now.
          </h2>
          <p style={{ color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>
            This assignment is not open for your section. If you believe you should still be able
            to submit — a missed deadline, an agreed extension — ask your instructor for a reopen.
          </p>
        </Card>
      ) : !view.schema ? (
        <Card>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--ochre)", margin: 0 }}>
            This assignment type&apos;s submission schema is malformed. Tell your instructor.
          </p>
        </Card>
      ) : (
        <SubmissionForm
          assignmentId={view.assignment.id}
          fields={view.schema.fields}
          anyOf={view.schema.anyOf}
          storageReady={s3Configured()}
          history={assessmentProjection?.assignment.contractMode === "versioned" ? [] : history}
          revisionGrants={(assessmentProjection?.grants ?? [])
            .filter((grant) => grant.state === "eligible")
            .map((grant) => ({
              grantId: grant.grantId,
              kind: grant.kind,
              targetVersion: grant.targetVersion,
              targetAttempt: grant.targetAttempt,
              expiresAt: grant.expiresAt,
            }))}
        />
      )}
    </main>
  );
}
