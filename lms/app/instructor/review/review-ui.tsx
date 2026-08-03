"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// U10 client pieces for the review queue: the inline override form (per-
// dimension edits with a live recomputed total, reason REQUIRED) and the
// per-assignment finalise button (server-enforced confirm: the endpoint
// answers needsConfirm + newlyFlagged before anything changes).

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.875rem",
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  color: "var(--ink)",
  padding: "0.375rem 0.5rem",
};

export function OverrideForm({
  gradeId,
  dimensions,
  feedbackMd,
}: {
  gradeId: string;
  dimensions: { key: string; score: number; rationale: string }[];
  feedbackMd: string;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(dimensions.map((d) => [d.key, d.score])),
  );
  const [feedback, setFeedback] = useState(feedbackMd);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => Object.values(scores).reduce((sum, s) => sum + (Number.isFinite(s) ? s : 0), 0),
    [scores],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("A reason is required to override a grade.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/grades/override", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gradeId, rubricScores: scores, feedbackMd: feedback, reason }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? "Override failed — try again.");
      return;
    }
    router.refresh();
  }

  return (
    <details style={{ marginTop: "0.75rem", borderTop: "1px solid var(--sand)", paddingTop: "0.75rem" }}>
      <summary style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)", cursor: "pointer" }}>
        Override this grade
      </summary>
      <form onSubmit={submit} style={{ marginTop: "0.75rem", display: "grid", gap: "0.75rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
          {dimensions.map((d) => (
            <label key={d.key} style={{ display: "grid", gap: "0.25rem" }}>
              <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>{d.key}</span>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                value={scores[d.key]}
                onChange={(e) => setScores((s) => ({ ...s, [d.key]: Number(e.target.value) }))}
                style={{ ...inputStyle, width: "4.5rem" }}
              />
            </label>
          ))}
          <span style={{ ...mono, fontSize: "0.75rem", color: "var(--pine)", padding: "0.375rem 0" }}>
            New total: {total}
          </span>
        </div>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>Feedback (markdown)</span>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            style={{ ...inputStyle, fontFamily: "var(--font-geist-sans)", resize: "vertical" }}
          />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
            Reason (required)
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you overriding this grade?"
            required
            style={{ ...inputStyle, fontFamily: "var(--font-geist-sans)" }}
          />
        </label>
        {error && (
          <p style={{ margin: 0, color: "#8a3b1c", fontSize: "0.875rem" }}>{error}</p>
        )}
        <div>
          <button
            type="submit"
            disabled={busy || !reason.trim()}
            style={{
              fontFamily: "var(--font-geist-sans)",
              fontSize: "0.9375rem",
              background: busy || !reason.trim() ? "var(--clay)" : "var(--pine)",
              color: "var(--cream)",
              border: "1px solid var(--pine)",
              padding: "0.5rem 1.25rem",
              cursor: busy || !reason.trim() ? "default" : "pointer",
            }}
          >
            {busy ? "Saving…" : "Save override"}
          </button>
        </div>
      </form>
    </details>
  );
}

type FinaliseResponse = {
  needsConfirm?: boolean;
  count?: number;
  ok?: boolean;
  finalised?: number;
  newlyFlagged?: { studentName: string; total: number; reason: string }[];
  error?: string;
};

export function FinaliseButton({
  assignmentId,
  assignmentTitle,
}: {
  assignmentId: string;
  assignmentTitle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function call(confirmed: boolean): Promise<FinaliseResponse | null> {
    const res = await fetch("/api/grades/finalise", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignmentId, ...(confirmed ? { confirmed: true } : {}) }),
    }).catch(() => null);
    return res ? ((await res.json().catch(() => null)) as FinaliseResponse) : null;
  }

  async function finalise() {
    setBusy(true);
    setMessage(null);
    const preview = await call(false);
    if (!preview || preview.error) {
      setMessage(preview?.error ?? "Finalise failed — try again.");
      setBusy(false);
      return;
    }
    const flagged = preview.newlyFlagged ?? [];
    const warning =
      flagged.length > 0
        ? `\n\n${flagged.length} grade${flagged.length === 1 ? "" : "s"} now sit in the top/bottom 5% and are unreviewed — they will be HELD BACK for review:\n${flagged
            .map((f) => `  · ${f.studentName} (${f.total}, ${f.reason})`)
            .join("\n")}`
        : "";
    const go = window.confirm(
      `Finalise ${preview.count} grade${preview.count === 1 ? "" : "s"} for "${assignmentTitle}"? Students will see their grades as final.${warning}`,
    );
    if (!go) {
      setBusy(false);
      return;
    }
    const result = await call(true);
    setBusy(false);
    if (!result?.ok) {
      setMessage(result?.error ?? "Finalise failed — try again.");
      return;
    }
    const held = result.newlyFlagged?.length ?? 0;
    setMessage(
      `Finalised ${result.finalised}.${held > 0 ? ` ${held} held back for review.` : ""}`,
    );
    router.refresh();
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem" }}>
      {message && (
        <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--charcoal)" }}>{message}</span>
      )}
      <button
        type="button"
        onClick={finalise}
        disabled={busy}
        style={{
          ...mono,
          fontSize: "0.6875rem",
          background: busy ? "var(--clay)" : "var(--pine)",
          color: "var(--cream)",
          border: "1px solid var(--pine)",
          padding: "0.5rem 1rem",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Working…" : "Finalise assignment"}
      </button>
    </span>
  );
}
