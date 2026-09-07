"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

// Instructor resolution actions: resolve escalation (accept AI grade),
// adjust category scores (reason required), grant a retake. All audited
// server-side.

const CATEGORY_LABELS: Record<string, string> = {
  // Interview v2
  conceptual_understanding: "Conceptual understanding",
  work_integrity: "Work integrity",
  // Pre-v2 rubric, kept so historical interviews still label their scores.
  industry_command: "Industry command",
  defence_of_submissions: "Defence of submissions",
  operators_loop: "Operator's Loop",
  transfer: "Transfer",
};

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: res.ok, error: json.error };
}

export function InterviewActions({
  interviewId,
  studentUserId,
  status,
  currentScores,
  hasUnusedRetake,
}: {
  interviewId: string;
  studentUserId: string;
  status: string;
  currentScores: Record<string, number>;
  hasUnusedRetake: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [scores, setScores] = useState(currentScores);
  const [reason, setReason] = useState("");

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong.");
      return;
    }
    setNotice(done);
    setAdjusting(false);
    router.refresh();
  };

  return (
    <Card>
      <p
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.6875rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--clay)",
          margin: "0 0 1rem",
        }}
      >
        Actions
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        {status === "escalated" && (
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () => post("/api/interview/resolve", { action: "mark-graded", interviewId }),
                "Escalation resolved — the AI grade now stands.",
              )
            }
          >
            Resolve escalation (accept AI grade)
          </Button>
        )}
        {(status === "escalated" || status === "graded") && (
          <Button disabled={busy} onClick={() => setAdjusting((v) => !v)}>
            {adjusting ? "Cancel adjustment" : "Adjust scores"}
          </Button>
        )}
        <Button
          disabled={busy || hasUnusedRetake}
          onClick={() =>
            run(
              () => post("/api/interview/grant-retake", { userId: studentUserId }),
              "Retake granted — the student can start again inside the window.",
            )
          }
        >
          {hasUnusedRetake ? "Retake already granted" : "Grant retake"}
        </Button>
      </div>

      {adjusting && (
        <div style={{ marginTop: "1.25rem", display: "grid", gap: "0.75rem", maxWidth: "28rem" }}>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ flex: 1 }}>{label}</span>
              <input
                type="number"
                min={0}
                max={25}
                value={scores[key] ?? 0}
                onChange={(e) =>
                  setScores((s) => ({ ...s, [key]: Math.max(0, Math.min(25, Number(e.target.value))) }))
                }
                style={{
                  width: "5rem",
                  border: "1px solid var(--sand)",
                  background: "var(--parchment)",
                  padding: "0.375rem 0.5rem",
                }}
              />
              <span style={{ color: "var(--clay)", fontSize: "0.8125rem" }}>/ 25</span>
            </label>
          ))}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reason for the adjustment (required, audited)"
            style={{
              border: "1px solid var(--sand)",
              background: "var(--parchment)",
              padding: "0.625rem",
              fontFamily: "var(--font-geist-sans)",
              fontSize: "0.9375rem",
            }}
          />
          <div>
            <Button
              disabled={busy || reason.trim().length < 3}
              onClick={() =>
                run(
                  () => post("/api/interview/resolve", { action: "adjust", interviewId, scores, reason: reason.trim() }),
                  "Scores adjusted and recorded.",
                )
              }
            >
              Save adjusted scores
            </Button>
          </div>
        </div>
      )}

      {error && <p style={{ color: "#8a3b1c", margin: "1rem 0 0" }}>{error}</p>}
      {notice && <p style={{ color: "var(--pine)", margin: "1rem 0 0" }}>{notice}</p>}
    </Card>
  );
}

/**
 * Reopen a dropped interview and produce the reply to send the student. There
 * is no transactional email in this system, so this composes the text and the
 * instructor pastes it — carrying what the student already covered so they are
 * not asked to repeat it.
 */
export function RegenerateInterview({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/interview/regenerate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interviewId }),
    });
    const json = (await res.json().catch(() => ({}))) as { draft?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not reopen the interview.");
      return;
    }
    setDraft(json.draft ?? null);
    router.refresh();
  }

  return (
    <Card style={{ marginTop: "1.5rem" }}>
      <p style={{ margin: "0 0 0.75rem", fontWeight: 600 }}>Interview cut off</p>
      <p style={{ margin: "0 0 1rem", color: "var(--charcoal)", lineHeight: 1.6 }}>
        Reopens the interview and writes a reply carrying what they already covered.
      </p>
      <Button onClick={() => void regenerate()} disabled={busy}>
        {busy ? "Reopening…" : "Reopen and draft a reply"}
      </Button>
      {error && (
        <p style={{ margin: "0.75rem 0 0", color: "#8a3b1c" }} role="alert">
          {error}
        </p>
      )}
      {draft && (
        <>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(draft)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
              style={{
                border: "1px solid var(--sand)",
                background: "transparent",
                color: "var(--charcoal)",
                padding: "0.5rem 1rem",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              {copied ? "Copied" : "Copy reply"}
            </button>
          </div>
          <pre
            style={{
              marginTop: "1rem",
              whiteSpace: "pre-wrap",
              fontFamily: "var(--font-geist-mono)",
              fontSize: "0.8125rem",
              lineHeight: 1.55,
              color: "var(--charcoal)",
              borderTop: "1px solid var(--sand)",
              paddingTop: "1rem",
            }}
          >
            {draft}
          </pre>
        </>
      )}
    </Card>
  );
}
