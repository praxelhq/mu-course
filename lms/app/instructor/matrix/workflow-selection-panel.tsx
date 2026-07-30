"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InstructorWorkflowCandidate } from "@/lib/assessment-projections";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

function WorkflowCandidate({ candidate }: { candidate: InstructorWorkflowCandidate }) {
  const router = useRouter();
  const eligibleNominations = candidate.nominations.filter(
    (nomination) => nomination.status === "pending" || nomination.status === "accepted",
  );
  const [nominationId, setNominationId] = useState("");
  const [reason, setReason] = useState(candidate.selection?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(Boolean(candidate.selection?.selected));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function select(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/instructor/workflows/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: candidate.teamId,
          assignmentId: candidate.assignmentId,
          submissionId: candidate.submissionId,
          ...(nominationId ? { nominationId } : {}),
          reason: reason.trim(),
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; changed?: boolean } | null;
      if (!response.ok) throw new Error(body?.error ?? `Workflow selection failed (${response.status})`);
      setSelected(true);
      setMessage(
        `${body?.changed === false ? "Selection already current" : "Selection recorded"}: Version ${candidate.version}, attempt ${candidate.attempt} for ${candidate.teamName}.`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workflow selection failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li style={{ borderTop: "1px solid var(--sand)", padding: "1rem 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "baseline" }}>
        <strong>{candidate.teamName}</strong>
        <span>{candidate.studentName}</span>
        <span>{candidate.assignmentTitle}</span>
        <span style={{ ...mono, color: "var(--clay)" }}>Version {candidate.version} · attempt {candidate.attempt}</span>
        {selected && <span style={{ ...mono, color: "var(--pine)" }}>Instructor-selected exact version</span>}
      </div>
      <p style={{ ...mono, color: "var(--charcoal)", margin: "0.5rem 0" }}>
        Result {candidate.resultStatus ?? "not started"} · {candidate.scoreable ? "scoreable" : "not scoreable"} · {candidate.hasFinalGrade ? "final grade" : "no final grade"}
      </p>
      {candidate.nominations.length > 0 ? (
        <ul aria-label="Learner nominations" style={{ margin: "0 0 0.75rem", paddingLeft: "1.25rem" }}>
          {candidate.nominations.map((nomination) => (
            <li key={nomination.nominationId}>
              <span style={{ ...mono, color: "var(--clay)" }}>{nomination.status}</span> — {nomination.reason}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: "0 0 0.75rem", color: "var(--charcoal)" }}>No learner nomination. Instructor-only selection is still allowed.</p>
      )}

      {!candidate.selectable ? (
        <p role="alert" style={{ color: "var(--ochre)", margin: 0 }}>
          Selection is unavailable until this exact version is scoreable and has a final grade.
        </p>
      ) : (
        <form onSubmit={select} style={{ display: "grid", gap: "0.5rem" }}>
          <label style={{ display: "grid", gap: "0.25rem", maxWidth: "32rem" }}>
            <span style={{ ...mono, color: "var(--clay)" }}>Nomination link</span>
            <select
              value={nominationId}
              onChange={(event) => setNominationId(event.target.value)}
              style={{ border: "1px solid var(--sand)", background: "var(--parchment)", color: "var(--ink)", padding: "0.5rem" }}
            >
              <option value="">Instructor-only selection</option>
              {eligibleNominations.map((nomination) => (
                <option key={nomination.nominationId} value={nomination.nominationId}>
                  Use {nomination.status} nomination · {nomination.reason.slice(0, 80)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ ...mono, color: "var(--clay)" }}>Audited selection reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={1000}
              rows={2}
              style={{ border: "1px solid var(--sand)", background: "var(--parchment)", color: "var(--ink)", padding: "0.5rem", resize: "vertical" }}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !reason.trim()}
            style={{ ...mono, justifySelf: "start", color: "var(--cream)", background: "var(--pine)", border: "1px solid var(--pine)", padding: "0.5rem 0.75rem", opacity: busy || !reason.trim() ? 0.6 : 1 }}
          >
            {busy ? "Selecting exact version…" : "Select this exact version"}
          </button>
        </form>
      )}
      <div role="status" aria-live="polite">
        {message && <p style={{ color: "var(--pine)", margin: "0.75rem 0 0" }}>{message}</p>}
      </div>
      {error && <p role="alert" style={{ color: "var(--ochre)", margin: "0.75rem 0 0" }}>{error}</p>}
    </li>
  );
}

export function WorkflowSelectionPanel({ candidates }: { candidates: InstructorWorkflowCandidate[] }) {
  return (
    <section aria-labelledby="workflow-selection-heading" style={{ border: "1px solid var(--sand)", padding: "1.5rem", marginBottom: "2rem" }}>
      <h2 id="workflow-selection-heading" style={{ fontSize: "1.25rem", margin: "0 0 0.25rem" }}>
        S5 team workflow selection
      </h2>
      <p style={{ color: "var(--charcoal)", margin: "0 0 0.75rem", lineHeight: 1.6 }}>
        Learner nominations are advisory. Only this instructor action selects one existing finalised version for the team roll-up.
      </p>
      {candidates.length === 0 ? (
        <p style={{ margin: 0 }}>No finalised workflow versions are ready for selection.</p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {candidates.map((candidate) => (
            <WorkflowCandidate
              key={`${candidate.submissionId}:${candidate.selection?.selected ?? false}`}
              candidate={candidate}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
