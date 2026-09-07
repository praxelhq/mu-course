import { Card, StatusChip } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import type {
  LearnerAssignmentProjection,
  LearnerSubmissionHistoryItem,
} from "@/lib/assessment-projections";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.625rem",
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

export function assessmentResultMessage(item: LearnerSubmissionHistoryItem): string {
  if (item.lifecycle === "draft") {
    return "Draft only — this version has not been submitted.";
  }
  if (!item.result) {
    return item.latestGrade
      ? "Evaluation complete."
      : "Submission receipt saved. Grading has not started yet.";
  }
  switch (item.result.status) {
    case "pending":
      return "Queued for grading. The immutable submission receipt is preserved.";
    case "claimed":
      return "Grading is in progress. The immutable submission receipt is preserved.";
    case "deterministic_complete":
      return "Objective checks are complete; generated feedback is still pending.";
    case "provider_pending":
      return "Generated feedback is delayed. The submission is safe and will continue automatically.";
    case "completed":
      return item.latestGrade
        ? `${item.latestGrade.state === "provisional" ? "Provisional" : "Final"} results are ready.`
        : "Formative feedback is ready.";
    case "repair_required":
      return "Evaluation found a repairable evidence problem. This receipt stays intact; use a repair attempt only when granted.";
    case "failed":
      return "A grading attempt failed and is eligible for retry. Your submitted work is preserved.";
    case "dead_lettered":
      return "Grading stopped after repeated failures. Your submitted work is preserved; an instructor must intervene.";
    default:
      return `Evaluation state: ${item.result.status.replaceAll("_", " ")}.`;
  }
}

function contractIdentity(projection: LearnerAssignmentProjection) {
  const assessment = projection.history[0]?.assessment ?? projection.activeAssessment;
  if (!assessment) return null;
  return (
    <Card style={{ marginBottom: "1.5rem" }}>
      <p style={{ ...mono, color: "var(--clay)", margin: "0 0 0.5rem" }}>
        Frozen assessment contract
      </p>
      <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>
        Assessment version {assessment.version}
      </h2>
      {assessment.dataset ? (
        <p style={{ margin: "0 0 0.5rem", color: "var(--charcoal)", lineHeight: 1.6 }}>
          Dataset: {assessment.dataset.title} · release {assessment.dataset.version}
        </p>
      ) : (
        <p style={{ margin: "0 0 0.5rem", color: "var(--charcoal)" }}>
          No dataset release is bound to this assessment.
        </p>
      )}
      <p
        title={assessment.checksumSha256}
        style={{ ...mono, color: "var(--clay)", margin: 0, overflowWrap: "anywhere" }}
      >
        Contract checksum {assessment.checksumSha256.slice(0, 12)}…
        {assessment.dataset && ` · dataset checksum ${assessment.dataset.checksumSha256.slice(0, 12)}…`}
      </p>
    </Card>
  );
}

export function LearnerAssessmentStatus({
  projection,
  available,
  canSubmit,
}: {
  projection: LearnerAssignmentProjection;
  available: boolean;
  canSubmit: boolean;
}) {
  const submitted = projection.history.filter((item) => item.lifecycle !== "draft");
  const eligibleGrants = projection.grants.filter((grant) => grant.state === "eligible");

  return (
    <>
      {contractIdentity(projection)}

      <Card style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "baseline" }}>
          <h2 style={{ fontSize: "1.125rem", margin: 0 }}>Version and attempt timeline</h2>
          <span style={{ ...mono, color: "var(--clay)" }}>
            {submitted.length} immutable receipt{submitted.length === 1 ? "" : "s"}
          </span>
        </div>

        {projection.history.length === 0 ? (
          <p style={{ color: "var(--charcoal)", margin: "1rem 0 0", lineHeight: 1.6 }}>
            {available && canSubmit
              ? "Version 1 · attempt 1 is eligible. No submission receipt exists yet."
              : "Version 1 is unavailable until this assignment opens for you."}
          </p>
        ) : (
          <ol
            aria-label="Submission evaluation timeline, newest first"
            style={{ listStyle: "none", padding: 0, margin: "1rem 0 0" }}
          >
            {projection.history.map((item) => {
              const isLatestSubmitted = item.submissionId === projection.latestSubmittedId;
              const isScoreable = item.submissionId === projection.latestScoreableId;
              return (
                <li
                  key={item.submissionId}
                  style={{ borderTop: "1px solid var(--sand)", padding: "0.875rem 0" }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                    <strong>Version {item.version} · attempt {item.attempt}</strong>
                    <StatusChip status={item.lifecycle} />
                    {isLatestSubmitted && <span style={{ ...mono, color: "var(--charcoal)" }}>Latest receipt</span>}
                    {isScoreable && <span style={{ ...mono, color: "var(--pine)" }}>Current scored version</span>}
                  </div>
                  <p style={{ color: "var(--charcoal)", margin: "0.5rem 0 0", lineHeight: 1.55 }}>
                    {assessmentResultMessage(item)}
                  </p>
                  {item.feedback && (
                    <div style={{ borderLeft: "2px solid var(--sand)", paddingLeft: "0.875rem", marginTop: "0.75rem" }}>
                      <p style={{ ...mono, color: "var(--clay)", margin: "0 0 0.375rem" }}>
                        Formative feedback
                      </p>
                      <Markdown>{item.feedback.summaryMd}</Markdown>
                      {item.feedback.actionItems.length > 0 && (
                        <ul aria-label="Feedback action items" style={{ margin: "0.5rem 0", paddingLeft: "1.25rem" }}>
                          {item.feedback.actionItems.map((actionItem) => (
                            <li key={actionItem}>{actionItem}</li>
                          ))}
                        </ul>
                      )}
                      {item.feedback.citations.length > 0 && (
                        <p style={{ ...mono, color: "var(--clay)", margin: "0.5rem 0 0" }}>
                          Evidence cited: {item.feedback.citations.map((citation) => `${citation.dimension} (${citation.evidenceCount})`).join(" · ")}
                        </p>
                      )}
                    </div>
                  )}
                  {item.submittedAt && (
                    <p style={{ ...mono, color: "var(--clay)", margin: "0.375rem 0 0" }}>
                      Received {dateFmt.format(new Date(item.submittedAt))}
                    </p>
                  )}
                  {item.publication && (
                    <p style={{ ...mono, color: "var(--clay)", margin: "0.375rem 0 0" }}>
                      Publication: owner {item.publication.ownerState.replaceAll("-", " ")} · instructor {item.publication.instructorState}
                    </p>
                  )}
                  {projection.workflow.selectedSubmissionId === item.submissionId && (
                    <p style={{ ...mono, color: "var(--pine)", margin: "0.375rem 0 0" }}>
                      Instructor-selected team workflow version
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {(projection.assignment.contractMode === "versioned" || projection.grants.length > 0) && (
        <Card style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>Revision eligibility</h2>
          {projection.grants.length === 0 ? (
            <p style={{ margin: 0, color: "var(--charcoal)", lineHeight: 1.6 }}>
              {projection.history.length === 0
                ? "No revision is needed before Version 1."
                : "No additional version or repair attempt is eligible."}
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {projection.grants.map((grant) => (
                <li key={grant.grantId} style={{ borderTop: "1px solid var(--sand)", padding: "0.625rem 0" }}>
                  <p style={{ margin: 0 }}>
                    <strong>{grant.kind === "repair" ? "Repair" : "Improvement"}</strong> · Version {grant.targetVersion} · attempt {grant.targetAttempt}
                  </p>
                  <p style={{ ...mono, color: grant.state === "eligible" ? "var(--pine)" : "var(--clay)", margin: "0.25rem 0 0" }}>
                    {grant.state === "eligible" && `Eligible until ${dateFmt.format(new Date(grant.expiresAt))}`}
                    {grant.state === "expired" && `Expired ${dateFmt.format(new Date(grant.expiresAt))}`}
                    {grant.state === "consumed" && `Consumed ${grant.consumedAt ? dateFmt.format(new Date(grant.consumedAt)) : "by an immutable receipt"}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {eligibleGrants.length > 0 && !canSubmit && (
            <p role="alert" style={{ color: "var(--ochre)", margin: "0.75rem 0 0" }}>
              A revision grant is eligible, but the form could not open. Refresh this page or contact your instructor.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
