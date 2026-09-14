"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

// Stop calling this number provisional. One student, one reason, one confirm.
//
// `force` is behind a second confirm because it does the one thing the grade
// rule forbids: finalises a student who has not cleared all six checkpoints
// (SPEC §7 makes graduation a gate, not a weight). There are real reasons to
// do it — a medical exemption, a roster correction — and none of them are
// reasons to do it by accident.

export function FinaliseGrade({
  userId,
  studentName,
  alreadyFinal,
}: {
  userId: string;
  studentName: string;
  alreadyFinal: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ready = reason.trim().length >= 8;

  async function send() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shipyard/admin/grades/finalise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, reason: reason.trim(), ...(force ? { force: true } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            error?: string;
            finalised?: { total: number }[];
            refused?: { reason: string }[];
          }
        | null;
      if (!res.ok) {
        setError(body?.error ?? `That did not go through (${res.status}).`);
        return;
      }
      const refused = body?.refused?.[0];
      if (refused) {
        setError(
          refused.reason === "not-graduated"
            ? "Not all six checkpoints are cleared. Finalising anyway needs the override below."
            : "There is no grade to finalise yet. Recompute it first.",
        );
        setArming(false);
        return;
      }
      const total = body?.finalised?.[0]?.total;
      setDone(
        total === undefined
          ? "Finalised, and logged against your name."
          : `Finalised at ${total.toFixed(1)}, and logged against your name.`,
      );
      setArming(false);
      router.refresh();
    } catch {
      setError("That did not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="sy-action">
        <h3 className="sy-action__head">Grade finalised</h3>
        <p className="sy-action__done" role="status">
          {done}
        </p>
      </section>
    );
  }

  if (alreadyFinal) {
    return null;
  }

  return (
    <section className="sy-action">
      <h3 className="sy-action__head">Finalise this student&rsquo;s grade</h3>
      <p className="sy-action__note">
        {studentName}{" "}
        stops seeing &ldquo;provisional&rdquo;, and the number stops moving when the
        weights change. Audit-logged under your name.
      </p>

      <label className="sy-field__label" htmlFor={`${id}-why`}>
        Why <span className="sy-field__req"> · at least eight characters</span>
      </label>
      <textarea
        id={`${id}-why`}
        className="sy-textarea sy-textarea--short"
        value={reason}
        maxLength={500}
        placeholder="End of term, marks agreed in the moderation meeting."
        aria-describedby={error ? `${id}-err` : undefined}
        disabled={busy}
        onChange={(e) => {
          setReason(e.target.value);
          setError(null);
        }}
      />

      <label className="sy-check">
        <input
          type="checkbox"
          checked={force}
          disabled={busy}
          onChange={(e) => {
            setForce(e.target.checked);
            setArming(false);
          }}
        />
        Finalise even though the six checkpoints are not all cleared
      </label>

      {error && (
        <p className="sy-field__error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}

      <div className="sy-actions">
        {!arming ? (
          <button
            type="button"
            className="sy-btn sy-btn--quiet"
            disabled={!ready || busy}
            onClick={() => setArming(true)}
          >
            Finalise
          </button>
        ) : (
          <>
            <button type="button" className="sy-btn" disabled={busy || !ready} onClick={send}>
              {busy
                ? "Finalising"
                : force
                  ? "Yes, finalise without graduation"
                  : "Yes, finalise it"}
            </button>
            <button
              type="button"
              className="sy-btn sy-btn--quiet"
              disabled={busy}
              onClick={() => setArming(false)}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </section>
  );
}
