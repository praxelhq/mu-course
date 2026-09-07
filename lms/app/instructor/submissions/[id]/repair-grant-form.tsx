"use client";

import { useMemo, useState } from "react";

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

function defaultExpiry(): string {
  const value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  value.setSeconds(0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function responseError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

export function RepairGrantForm({
  submissionId,
  expectedSourceUpdatedAt,
  assignmentId,
  assessmentVersionId,
  ownerKind,
  ownerId,
  targetVersion,
  targetAttempt,
}: {
  submissionId: string;
  expectedSourceUpdatedAt: string;
  assignmentId: string;
  assessmentVersionId: string;
  ownerKind: "individual" | "team";
  ownerId: string;
  targetVersion: number;
  targetAttempt: number;
}) {
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expiryIso = useMemo(() => {
    const parsed = new Date(expiresAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }, [expiresAt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!expiryIso) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/instructor/submission-grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "issue-repair",
          sourceSubmissionId: submissionId,
          expectedSourceUpdatedAt,
          assignmentId,
          assessmentVersionId,
          ownerKind,
          ownerId,
          targetVersion,
          targetAttempt,
          expiresAt: expiryIso,
          reason: reason.trim(),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { changed?: boolean; grant?: { id?: string } }
        | { error?: string }
        | null;
      if (!response.ok || !body || !("grant" in body) || !body.grant) {
        throw new Error(responseError(body, `Repair grant could not be issued (${response.status})`));
      }
      setMessage(
        body.changed === false
          ? `The identical Version ${targetVersion}, attempt ${targetAttempt} repair grant already exists.`
          : `Repair opened for Version ${targetVersion}, attempt ${targetAttempt}. The original receipt remains immutable.`,
      );
      setReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Repair grant could not be issued.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "0.75rem" }}>
      <p style={{ margin: 0, color: "var(--charcoal)", lineHeight: 1.6 }}>
        Open one audited repair attempt for this exact immutable Version {targetVersion} receipt.
        The learner cannot use the grant for another assignment, version, or attempt.
      </p>
      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span style={{ ...mono, color: "var(--clay)" }}>Grant expires</span>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
          required
          style={input}
        />
      </label>
      <label style={{ display: "grid", gap: "0.25rem" }}>
        <span style={{ ...mono, color: "var(--clay)" }}>Audited repair reason</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={3}
          maxLength={1000}
          rows={4}
          required
          style={{ ...input, resize: "vertical" }}
        />
      </label>
      <button
        type="submit"
        disabled={busy || !expiryIso || reason.trim().length < 3}
        style={{
          ...mono,
          justifySelf: "start",
          color: "var(--cream)",
          background: "var(--pine)",
          border: "1px solid var(--pine)",
          padding: "0.625rem 1rem",
          opacity: busy || !expiryIso || reason.trim().length < 3 ? 0.6 : 1,
        }}
      >
        {busy ? "Opening repair…" : `Open attempt ${targetAttempt}`}
      </button>
      <div role="status" aria-live="polite">
        {message && <p style={{ color: "var(--pine)", margin: 0 }}>{message}</p>}
      </div>
      {error && <p role="alert" style={{ color: "var(--ochre)", margin: 0 }}>{error}</p>}
    </form>
  );
}
