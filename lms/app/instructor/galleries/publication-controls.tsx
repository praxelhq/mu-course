"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InstructorPublicationCandidate } from "@/lib/assessment-projections";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

function Candidate({ initial }: { initial: InstructorPublicationCandidate }) {
  const router = useRouter();
  const [candidate, setCandidate] = useState(initial);
  const [state, setState] = useState<"approved" | "withheld" | "revoked">(
    initial.instructorState === "pending" ? "approved" : initial.instructorState,
  );
  const [reason, setReason] = useState(initial.instructorReason ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approvalBlocked = state === "approved" && (!candidate.publishable || !candidate.previewReady);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/instructor/publication", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId: candidate.submissionId,
          state,
          ...(state === "approved" ? {} : { reason: reason.trim() }),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            projectionSync?: "updated" | "deferred" | "not-needed";
            decision?: {
              instructorState: InstructorPublicationCandidate["instructorState"];
              instructorReason: string | null;
              reviewedFingerprint: string | null;
            };
          }
        | null;
      if (!response.ok || !body?.decision) {
        throw new Error(body?.error ?? `Publication decision failed (${response.status})`);
      }
      setCandidate((current) => ({
        ...current,
        instructorState: body.decision!.instructorState,
        instructorReason: body.decision!.instructorReason,
        reviewCurrent: body.decision!.instructorState === "approved" && Boolean(body.decision!.reviewedFingerprint),
      }));
      setMessage(
        `${state} recorded for Version ${candidate.version}, attempt ${candidate.attempt}. ${
          body.projectionSync === "deferred"
            ? "The decision is authoritative; gallery reconciliation is queued."
            : "The gallery projection is current."
        }`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Publication decision failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li style={{ borderTop: "1px solid var(--sand)", padding: "1rem 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "baseline" }}>
        <strong>{candidate.ownerName}</strong>
        <span>{candidate.assignmentTitle}</span>
        <span style={{ ...mono, color: "var(--clay)" }}>Version {candidate.version} · attempt {candidate.attempt}</span>
      </div>
      <p style={{ ...mono, color: "var(--charcoal)", margin: "0.5rem 0" }}>
        Result {candidate.resultStatus ?? "not started"} · {candidate.publishable ? "publishable" : "not publishable"} · preview {candidate.previewReady ? "ready" : "missing"}
      </p>
      <p style={{ margin: "0 0 0.75rem", color: "var(--charcoal)" }}>
        Owner: <strong>{candidate.ownerState.replaceAll("-", " ")}</strong> · Instructor: <strong>{candidate.instructorState}</strong>
        {candidate.instructorState === "approved" && !candidate.reviewCurrent && " · approval is stale for the current evidence"}
      </p>
      {candidate.previewUrl && (
        <p style={{ margin: "0 0 0.75rem" }}>
          <a href={candidate.previewUrl} target="_blank" rel="noreferrer">
            Open the exact safe preview for review ↗
          </a>
        </p>
      )}

      <form onSubmit={save} style={{ display: "grid", gap: "0.5rem" }}>
        <label style={{ display: "grid", gap: "0.25rem", maxWidth: "22rem" }}>
          <span style={{ ...mono, color: "var(--clay)" }}>Instructor decision</span>
          <select
            value={state}
            onChange={(event) => setState(event.target.value as typeof state)}
            style={{ border: "1px solid var(--sand)", background: "var(--parchment)", color: "var(--ink)", padding: "0.5rem" }}
          >
            <option value="approved">Approve exact current version</option>
            <option value="withheld">Withhold</option>
            <option value="revoked">Revoke prior approval</option>
          </select>
        </label>
        {state !== "approved" && (
          <label style={{ display: "grid", gap: "0.25rem" }}>
            <span style={{ ...mono, color: "var(--clay)" }}>Audited reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={1000}
              rows={2}
              style={{ border: "1px solid var(--sand)", background: "var(--parchment)", color: "var(--ink)", padding: "0.5rem", resize: "vertical" }}
            />
          </label>
        )}
        {approvalBlocked && (
          <p role="alert" style={{ color: "var(--ochre)", margin: 0 }}>
            Approval is unavailable until evaluation marks this version publishable and its safe preview is ready.
          </p>
        )}
        <button
          type="submit"
          disabled={busy || approvalBlocked || (state !== "approved" && !reason.trim())}
          style={{ ...mono, justifySelf: "start", color: "var(--cream)", background: "var(--pine)", border: "1px solid var(--pine)", padding: "0.5rem 0.75rem", opacity: busy || approvalBlocked || (state !== "approved" && !reason.trim()) ? 0.6 : 1 }}
        >
          {busy ? "Saving decision…" : "Record publication decision"}
        </button>
      </form>
      <div role="status" aria-live="polite">
        {message && <p style={{ color: "var(--pine)", margin: "0.75rem 0 0" }}>{message}</p>}
      </div>
      {error && <p role="alert" style={{ color: "var(--ochre)", margin: "0.75rem 0 0" }}>{error}</p>}
    </li>
  );
}

export function PublicationControls({ candidates }: { candidates: InstructorPublicationCandidate[] }) {
  return (
    <section aria-labelledby="publication-candidates-heading" style={{ border: "1px solid var(--sand)", padding: "1.5rem", marginBottom: "2rem" }}>
      <h2 id="publication-candidates-heading" style={{ fontSize: "1.25rem", margin: "0 0 0.25rem" }}>
        Versioned publication decisions
      </h2>
      <p style={{ color: "var(--charcoal)", margin: "0 0 0.75rem", lineHeight: 1.6 }}>
        Review the exact evaluated version and safe preview. Owner consent and instructor approval are independent audited decisions.
      </p>
      {candidates.length === 0 ? (
        <p style={{ margin: 0 }}>No versioned publication candidates match this wall.</p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {candidates.map((candidate) => (
            <Candidate
              key={`${candidate.submissionId}:${candidate.instructorState}:${candidate.reviewCurrent}`}
              initial={candidate}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
