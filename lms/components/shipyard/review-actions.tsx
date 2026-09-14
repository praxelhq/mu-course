"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

// The three things a person can do to a flagged review, in the queue and on
// the drill-down alike — one component so the two screens can never drift.
//
//   Resolve → pass     the pass counts, the gate moves, the next one opens
//   Resolve → return   the reviewer is overruled the other way
//   Second opinion     a different model, with the dispute in the prompt
//
// Both rulings take a reason and a confirm, for the same reason the drill-down
// actions do: each one moves a named person through the course and is logged
// under whoever clicked. The second opinion takes neither — it changes nothing
// and costs about a cent — and its answer is shown here rather than filed
// somewhere, because the person who asked for it is reading this screen now.

type Decision = "pass" | "return";

type Escalation = {
  agreesWithFirstVerdict: boolean;
  verdict: string;
  confidence: number;
  humanNote: string;
  summaryForStudent: string;
  modelUsed: string;
};

const REASON_MAX = 500;

export function ReviewActions({
  reviewId,
  verdict,
  compact = false,
}: {
  reviewId: string;
  /** The verdict being ruled on, so the buttons can say which way is a change. */
  verdict: "pass" | "return";
  compact?: boolean;
}) {
  const id = useId();
  const router = useRouter();

  const [arming, setArming] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [escalation, setEscalation] = useState<Escalation | null>(null);

  const ready = reason.trim().length > 0 && reason.trim().length <= REASON_MAX;

  async function resolve(decision: Decision) {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipyard/reviews/${encodeURIComponent(reviewId)}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; status?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? `That did not go through (${res.status}).`);
        return;
      }
      setDone(
        decision === "pass"
          ? "Passed, and logged against your name. The next checkpoint is open."
          : "Returned, and logged against your name. The student has your reason.",
      );
      setArming(null);
      // A resolved review leaves the queue, which unmounts this component and
      // the sentence above with it. The pause is so the person who clicked gets
      // to read what they did before the row goes.
      setTimeout(() => router.refresh(), 1200);
    } catch {
      setError("That did not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  async function secondOpinion() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipyard/reviews/${encodeURIComponent(reviewId)}/escalate`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; modelUsed?: string; escalation?: Omit<Escalation, "modelUsed"> }
        | null;
      if (!res.ok || !body?.escalation) {
        setError(body?.error ?? `That did not go through (${res.status}).`);
        return;
      }
      setEscalation({ ...body.escalation, modelUsed: body.modelUsed ?? "" });
    } catch {
      setError("That did not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="sy-action__done" role="status">
        {done}
      </p>
    );
  }

  return (
    <div className={compact ? "sy-ruling sy-ruling--compact" : "sy-ruling"}>
      {arming === null ? (
        <div className="sy-actions">
          <button
            type="button"
            className="sy-btn sy-btn--quiet sy-btn--small"
            disabled={busy}
            onClick={() => {
              setArming("pass");
              setError(null);
            }}
          >
            Resolve → pass
          </button>
          <button
            type="button"
            className="sy-btn sy-btn--quiet sy-btn--small"
            disabled={busy}
            onClick={() => {
              setArming("return");
              setError(null);
            }}
          >
            Resolve → return
          </button>
          <button
            type="button"
            className="sy-btn sy-btn--quiet sy-btn--small"
            disabled={busy}
            onClick={secondOpinion}
          >
            {busy ? "Asking" : "Second opinion"}
          </button>
        </div>
      ) : (
        <div className="sy-ruling__form">
          <label className="sy-field__label" htmlFor={`${id}-why`}>
            Why this is a {arming === "pass" ? "pass" : "return"}
            <span className="sy-field__req"> · required</span>
          </label>
          <textarea
            id={`${id}-why`}
            className="sy-textarea sy-textarea--short"
            value={reason}
            maxLength={REASON_MAX}
            placeholder={
              arming === "pass"
                ? verdict === "pass"
                  ? "Why you agree with the reviewer. The student sees the pass, not this."
                  : "Why this meets the bar despite what the reviewer said."
                : "What the student has to change. They read this verbatim."
            }
            aria-describedby={error ? `${id}-err` : undefined}
            disabled={busy}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
          />
          {error && (
            <p className="sy-field__error" id={`${id}-err`} role="alert">
              {error}
            </p>
          )}
          <div className="sy-actions">
            <button
              type="button"
              className="sy-btn sy-btn--small"
              disabled={busy || !ready}
              onClick={() => resolve(arming)}
            >
              {busy ? "Recording" : arming === "pass" ? "Yes, pass it" : "Yes, return it"}
            </button>
            <button
              type="button"
              className="sy-btn sy-btn--quiet sy-btn--small"
              disabled={busy}
              onClick={() => {
                setArming(null);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && arming === null && (
        <p className="sy-field__error" role="alert">
          {error}
        </p>
      )}

      {escalation && (
        <div className="sy-second">
          <p className="sy-eyebrow">
            Second opinion ·{" "}
            {escalation.agreesWithFirstVerdict ? "agrees" : "disagrees"} · says{" "}
            {escalation.verdict}
          </p>
          <p className="sy-second__note">{escalation.humanNote}</p>
          <p className="sy-second__meta sy-mono">
            {escalation.modelUsed} · confidence {escalation.confidence.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
