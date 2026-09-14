"use client";

import { useId, useState } from "react";

// "I think this is wrong." One note, one time, per returned verdict.
//
// It is a disclosure rather than a button because of who reads it: a student
// looking at a return should be reading the fixes, not weighing an appeal. The
// affordance is there for the person who needs it and invisible to everyone
// else, and once it has been used it does not come back — the server allows
// exactly one dispute per review (DECISIONS, 2026-09-15), so a second control
// would only be a way to earn a 409.

const NOTE_MAX = 500;

export function DisputeForm({ reviewId }: { reviewId: string }) {
  const id = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className="sy-action__done" role="status">
        Sent to a reviewer. Your note is with an instructor; you will hear back here.
      </p>
    );
  }

  const left = NOTE_MAX - note.length;
  const ready = note.trim().length > 0 && left >= 0;

  async function send() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipyard/reviews/${encodeURIComponent(reviewId)}/dispute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: note.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        // The server's own sentence, verbatim: a 409 already explains whether
        // this was disputed once before or is not a return at all, and two
        // wordings of one rule is one wording too many.
        setError(body?.error ?? `That did not go through (${res.status}).`);
        return;
      }
      // Deliberately NOT router.refresh(): the dispute flags the review for a
      // person, and a refresh would re-render this panel with `pendingHuman`
      // true — which hides this control and takes the confirmation with it. The
      // student would click, watch the form vanish, and have no idea whether it
      // went. The server-rendered "with a human reviewer" line is there on the
      // next load; this sentence is for now.
      setSent(true);
    } catch {
      setError("That did not reach us. Nothing was sent; try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="sy-read sy-dispute">
      <summary>Dispute this verdict</summary>
      <div className="sy-read__body">
        <p className="sy-dispute__note">
          Say what the reviewer got wrong. It goes to an instructor with a second
          reviewer&rsquo;s opinion attached. One per verdict — resubmitting gets you a
          new one.
        </p>

        <label className="sy-field__label" htmlFor={id}>
          What it got wrong <span className="sy-field__req"> · required</span>
        </label>
        <textarea
          id={id}
          className="sy-textarea sy-textarea--short"
          value={note}
          maxLength={NOTE_MAX}
          placeholder="Name the clause and what you think it missed."
          aria-describedby={error ? `${id}-err` : `${id}-count`}
          aria-invalid={error ? true : undefined}
          disabled={busy}
          onChange={(e) => {
            setNote(e.target.value);
            setError(null);
          }}
        />
        <p className="sy-dispute__count sy-mono" id={`${id}-count`}>
          {left} left
        </p>

        {error && (
          <p className="sy-field__error" id={`${id}-err`} role="alert">
            {error}
          </p>
        )}

        <div className="sy-actions">
          <button
            type="button"
            className="sy-btn sy-btn--quiet"
            disabled={busy || !ready}
            onClick={send}
          >
            {busy ? "Sending" : "Send to a reviewer"}
          </button>
        </div>
      </div>
    </details>
  );
}
