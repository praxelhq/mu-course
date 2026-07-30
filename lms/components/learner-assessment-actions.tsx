"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LearnerAppealProjection } from "@/lib/grade-appeals";
import type { LearnerPublicationProjection } from "@/lib/assessment-projections";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  color: "var(--ink)",
  fontFamily: "var(--font-geist-sans)",
  fontSize: "0.9375rem",
  padding: "0.625rem 0.75rem",
};

const action: React.CSSProperties = {
  ...mono,
  color: "var(--cream)",
  background: "var(--pine)",
  border: "1px solid var(--pine)",
  padding: "0.625rem 1rem",
};

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function AppealPanel({
  gradeId,
  gradeState,
  initialAppeals,
}: {
  gradeId: string;
  gradeState: "provisional" | "final";
  initialAppeals: LearnerAppealProjection[];
}) {
  const [appeals, setAppeals] = useState(initialAppeals);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openAppeal = appeals.find((appeal) => appeal.status === "open");

  async function submitAppeal(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/grades/appeal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gradeId, reason: reason.trim() }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; appeal?: LearnerAppealProjection }
        | null;
      if (!response.ok || !body?.appeal) {
        throw new Error(errorMessage(body, `Appeal could not be submitted (${response.status})`));
      }
      setAppeals((current) => [...current, body.appeal!]);
      setReason("");
      setMessage("Appeal submitted. Your provisional grade is held for instructor review.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Appeal could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="appeal-heading" style={{ border: "1px solid var(--sand)", padding: "1.25rem" }}>
      <h2 id="appeal-heading" style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>
        Grade appeal
      </h2>
      {appeals.length > 0 && (
        <ol style={{ margin: "0 0 1rem", paddingLeft: "1.25rem" }}>
          {appeals.map((appeal) => (
            <li key={appeal.id} style={{ marginBottom: "0.5rem" }}>
              <span style={{ ...mono, color: appeal.status === "open" ? "var(--ochre)" : "var(--pine)" }}>
                {appeal.status}{appeal.outcome ? ` · ${appeal.outcome.replaceAll("_", " ")}` : ""}
              </span>
              <p style={{ margin: "0.25rem 0 0", color: "var(--charcoal)" }}>{appeal.reason}</p>
            </li>
          ))}
        </ol>
      )}
      {openAppeal ? (
        <p style={{ margin: 0, color: "var(--charcoal)", lineHeight: 1.6 }}>
          This appeal is open. You cannot open another appeal for the same grade.
        </p>
      ) : gradeState === "final" ? (
        <p style={{ margin: 0, color: "var(--charcoal)" }}>This grade is final; appeals are available only while a grade is provisional.</p>
      ) : (
        <form onSubmit={submitAppeal}>
          <label htmlFor="appeal-reason" style={{ ...mono, color: "var(--clay)", display: "block", marginBottom: "0.375rem" }}>
            Why should this provisional grade be reviewed?
          </label>
          <textarea
            id="appeal-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={2000}
            rows={4}
            style={{ ...input, resize: "vertical" }}
          />
          <button type="submit" disabled={busy || !reason.trim()} style={{ ...action, marginTop: "0.75rem", opacity: busy || !reason.trim() ? 0.6 : 1 }}>
            {busy ? "Submitting appeal…" : "Submit appeal"}
          </button>
        </form>
      )}
      <div role="status" aria-live="polite">
        {message && <p style={{ color: "var(--pine)", margin: "0.75rem 0 0" }}>{message}</p>}
      </div>
      {error && <p role="alert" style={{ color: "var(--ochre)", margin: "0.75rem 0 0" }}>{error}</p>}
    </section>
  );
}

function PublicationPanel({
  submissionId,
  initial,
}: {
  submissionId: string;
  initial: LearnerPublicationProjection;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consent = state.ownerState !== "consented";

  async function updateConsent() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/publication/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId, consent }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            projectionSync?: "updated" | "deferred" | "not-needed";
            decision?: {
              ownerConsent: boolean;
              ownerConsentAt: string | null;
              ownerRevokedAt: string | null;
              instructorState: LearnerPublicationProjection["instructorState"];
              instructorReason: string | null;
              reviewedAt: string | null;
            };
          }
        | null;
      if (!response.ok || !body?.decision) {
        throw new Error(errorMessage(body, `Publication consent could not be saved (${response.status})`));
      }
      setState({
        ownerState: body.decision.ownerRevokedAt
          ? "revoked"
          : body.decision.ownerConsent
            ? "consented"
            : "not-consented",
        ownerConsentAt: body.decision.ownerConsentAt,
        instructorState: body.decision.instructorState,
        instructorReason: body.decision.instructorReason,
        instructorDecidedAt: body.decision.reviewedAt,
      });
      setMessage(
        `${consent ? "Consent recorded" : "Consent revoked"}. ${
          body.projectionSync === "deferred"
            ? "The audited decision is saved; the gallery projection will refresh asynchronously."
            : "The audited gallery projection is current."
        }`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Publication consent could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="publication-heading" style={{ border: "1px solid var(--sand)", padding: "1.25rem" }}>
      <h2 id="publication-heading" style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>
        Gallery publication
      </h2>
      <p style={{ margin: "0 0 0.5rem", color: "var(--charcoal)", lineHeight: 1.6 }}>
        Owner consent: <strong>{state.ownerState.replaceAll("-", " ")}</strong> · Instructor decision: <strong>{state.instructorState}</strong>.
      </p>
      <p style={{ margin: "0 0 0.75rem", color: "var(--charcoal)", lineHeight: 1.6 }}>
        Both approvals must be current for this exact version. Grading or consent alone never publishes it.
      </p>
      {state.instructorReason && state.instructorState !== "approved" && (
        <p style={{ margin: "0 0 0.75rem", color: "var(--ochre)" }}>Instructor note: {state.instructorReason}</p>
      )}
      <button type="button" onClick={() => void updateConsent()} disabled={busy} style={{ ...action, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving decision…" : consent ? "Consent to publish this version" : "Revoke publication consent"}
      </button>
      <div role="status" aria-live="polite">
        {message && <p style={{ color: "var(--pine)", margin: "0.75rem 0 0" }}>{message}</p>}
      </div>
      {error && <p role="alert" style={{ color: "var(--ochre)", margin: "0.75rem 0 0" }}>{error}</p>}
    </section>
  );
}

type NominationView = {
  nominationId: string;
  submissionId: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  createdAt: string;
  updatedAt: string;
};

function WorkflowNominationPanel({
  assignmentId,
  submissionId,
  eligible,
  selected,
  initialNominations,
}: {
  assignmentId: string;
  submissionId: string;
  eligible: boolean;
  selected: boolean;
  initialNominations: NominationView[];
}) {
  const [nominations, setNominations] = useState(initialNominations);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pending = nominations.some((nomination) => nomination.status === "pending");

  async function nominate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/workflows/nominate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentId, submissionId, reason: reason.trim() }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; nomination?: { id: string; status: NominationView["status"] } }
        | null;
      if (!response.ok || !body?.nomination) {
        throw new Error(errorMessage(body, `Nomination could not be saved (${response.status})`));
      }
      const now = new Date().toISOString();
      setNominations((current) => [
        {
          nominationId: body.nomination!.id,
          submissionId,
          status: body.nomination!.status,
          createdAt: now,
          updatedAt: now,
        },
        ...current,
      ]);
      setReason("");
      setMessage("Nomination recorded. It is advisory; only the instructor can select the team workflow version.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nomination could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="workflow-nomination-heading" style={{ border: "1px solid var(--sand)", padding: "1.25rem" }}>
      <h2 id="workflow-nomination-heading" style={{ fontSize: "1.125rem", margin: "0 0 0.5rem" }}>
        Team workflow nomination
      </h2>
      {selected ? (
        <p style={{ color: "var(--pine)", margin: 0 }}>The instructor selected this exact version for the team roll-up.</p>
      ) : pending ? (
        <p style={{ color: "var(--charcoal)", margin: 0 }}>This exact version is nominated and awaiting instructor selection.</p>
      ) : eligible ? (
        <form onSubmit={nominate}>
          <p style={{ color: "var(--charcoal)", margin: "0 0 0.75rem", lineHeight: 1.6 }}>
            Nomination is advisory. It does not change the team score until an instructor selects this exact finalised version.
          </p>
          <label htmlFor="workflow-nomination-reason" style={{ ...mono, color: "var(--clay)", display: "block", marginBottom: "0.375rem" }}>
            Why should the instructor select this version?
          </label>
          <textarea
            id="workflow-nomination-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={1000}
            rows={3}
            style={{ ...input, resize: "vertical" }}
          />
          <button type="submit" disabled={busy || !reason.trim()} style={{ ...action, marginTop: "0.75rem", opacity: busy || !reason.trim() ? 0.6 : 1 }}>
            {busy ? "Nominating…" : "Nominate this exact version"}
          </button>
        </form>
      ) : (
        <p style={{ color: "var(--charcoal)", margin: 0 }}>This version is not eligible for team workflow nomination.</p>
      )}
      <div role="status" aria-live="polite">
        {message && <p style={{ color: "var(--pine)", margin: "0.75rem 0 0" }}>{message}</p>}
      </div>
      {error && <p role="alert" style={{ color: "var(--ochre)", margin: "0.75rem 0 0" }}>{error}</p>}
    </section>
  );
}

export function LearnerAssessmentActions({
  appeal,
  publication,
  workflow,
}: {
  appeal: {
    gradeId: string;
    gradeState: "provisional" | "final";
    appeals: LearnerAppealProjection[];
  } | null;
  publication: { submissionId: string; state: LearnerPublicationProjection } | null;
  workflow: {
    assignmentId: string;
    submissionId: string;
    eligible: boolean;
    selected: boolean;
    nominations: NominationView[];
  } | null;
}) {
  if (!appeal && !publication && !workflow) return null;
  return (
    <div style={{ display: "grid", gap: "1rem", marginBottom: "1.5rem" }}>
      {appeal && <AppealPanel gradeId={appeal.gradeId} gradeState={appeal.gradeState} initialAppeals={appeal.appeals} />}
      {publication && <PublicationPanel submissionId={publication.submissionId} initial={publication.state} />}
      {workflow && (
        <WorkflowNominationPanel
          assignmentId={workflow.assignmentId}
          submissionId={workflow.submissionId}
          eligible={workflow.eligible}
          selected={workflow.selected}
          initialNominations={workflow.nominations}
        />
      )}
    </div>
  );
}
