"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

// The two things faculty can do to a student's gate from the drill-down, both
// built the same way on purpose: a reason you have to type, a confirm step you
// have to mean, and the server's own words back if it refuses.
//
// The confirm step is not ceremony. Both of these move a specific person
// forwards or backwards in the course and both are audit-logged under the name
// of whoever clicked; a single misplaced click should not be able to do that.

type Phase = "idle" | "arming" | "sending";

function useAction() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function send(url: string, body: unknown, success: string) {
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(payload?.error ?? `That did not go through (${res.status}).`);
        setPhase("arming");
        return;
      }
      setDone(success);
      setPhase("idle");
      router.refresh();
    } catch {
      setError("That did not reach the server. Nothing was changed.");
      setPhase("arming");
    }
  }

  return { phase, setPhase, error, setError, done, send };
}

// ---------------------------------------------------------------------------
// Open a checkpoint by hand
// ---------------------------------------------------------------------------

export function OpenGateAction({
  userId,
  checkpoints,
}: {
  userId: string;
  checkpoints: { key: string; order: number; title: string; state: string }[];
}) {
  const id = useId();
  const { phase, setPhase, error, setError, done, send } = useAction();
  const locked = checkpoints.filter((c) => c.state === "locked");
  const [target, setTarget] = useState(locked[0]?.key ?? checkpoints[0]?.key ?? "");
  const [reason, setReason] = useState("");

  if (checkpoints.length === 0) return null;

  const ready = target !== "" && reason.trim().length >= 8;

  return (
    <section className="sy-action">
      <h3 className="sy-action__head">Open a checkpoint for this student</h3>
      <p className="sy-action__note">
        The escape hatch. It marks the checkpoint as opened by you and re-runs the
        gate rule; everything after it still has to be cleared normally.
      </p>

      <div className="sy-action__row">
        <label className="sy-visually-hidden" htmlFor={`${id}-cp`}>
          Checkpoint
        </label>
        <select
          id={`${id}-cp`}
          className="sy-input sy-select"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={phase === "sending"}
        >
          {checkpoints.map((c) => (
            <option key={c.key} value={c.key}>
              {c.order}. {c.title} — {c.state}
            </option>
          ))}
        </select>
      </div>

      <label className="sy-field__label" htmlFor={`${id}-why`}>
        Why <span className="sy-field__req"> · required</span>
      </label>
      <textarea
        id={`${id}-why`}
        className="sy-textarea sy-textarea--short"
        value={reason}
        placeholder="What happened, in a sentence somebody can read in six weeks."
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => {
          setReason(e.target.value);
          setError(null);
        }}
        disabled={phase === "sending"}
      />

      {error && (
        <p className="sy-field__error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
      {done && <p className="sy-action__done">{done}</p>}

      <div className="sy-actions">
        {phase === "idle" ? (
          <button
            type="button"
            className="sy-btn sy-btn--quiet"
            disabled={!ready}
            onClick={() => setPhase("arming")}
          >
            Open this checkpoint
          </button>
        ) : (
          <>
            <button
              type="button"
              className="sy-btn"
              disabled={phase === "sending" || !ready}
              onClick={() =>
                send(
                  "/api/shipyard/instructor/open-gate",
                  { userId, checkpointKey: target, reason: reason.trim() },
                  "Opened, and logged against your name.",
                )
              }
            >
              {phase === "sending" ? "Opening" : "Yes, open it"}
            </button>
            <button
              type="button"
              className="sy-btn sy-btn--quiet"
              disabled={phase === "sending"}
              onClick={() => {
                setPhase("idle");
                setError(null);
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Record a verdict by hand
// ---------------------------------------------------------------------------

export function RecordVerdictAction({
  submissionId,
  checkpointTitle,
}: {
  submissionId: string;
  checkpointTitle: string;
}) {
  const id = useId();
  const { phase, setPhase, error, setError, done, send } = useAction();
  const [verdict, setVerdict] = useState<"pass" | "return">("pass");
  const [reason, setReason] = useState("");

  const ready = reason.trim().length >= 8;

  return (
    <section className="sy-action sy-action--inline">
      <h3 className="sy-action__head">Record a verdict</h3>
      <p className="sy-action__note">
        {checkpointTitle} · this moves the gate and notifies the student, exactly
        as the reviewer would.
      </p>

      <fieldset className="sy-radios">
        <legend className="sy-visually-hidden">Verdict</legend>
        {(["pass", "return"] as const).map((v) => (
          <label className="sy-radio" key={v}>
            <input
              type="radio"
              name={`${id}-verdict`}
              value={v}
              checked={verdict === v}
              onChange={() => setVerdict(v)}
              disabled={phase === "sending"}
            />
            {v === "pass" ? "Pass" : "Return"}
          </label>
        ))}
      </fieldset>

      <label className="sy-field__label" htmlFor={`${id}-why`}>
        Reason <span className="sy-field__req"> · required</span>
      </label>
      <textarea
        id={`${id}-why`}
        className="sy-textarea sy-textarea--short"
        value={reason}
        placeholder={
          verdict === "pass"
            ? "Why this meets the bar despite what the reviewer said."
            : "What the student has to change. They read this verbatim."
        }
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => {
          setReason(e.target.value);
          setError(null);
        }}
        disabled={phase === "sending"}
      />

      {error && (
        <p className="sy-field__error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
      {done && <p className="sy-action__done">{done}</p>}

      <div className="sy-actions">
        {phase === "idle" ? (
          <button
            type="button"
            className="sy-btn sy-btn--quiet"
            disabled={!ready}
            onClick={() => setPhase("arming")}
          >
            Record {verdict === "pass" ? "a pass" : "a return"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="sy-btn"
              disabled={phase === "sending" || !ready}
              onClick={() =>
                send(
                  "/api/shipyard/admin/review-stub",
                  { submissionId, verdict, reason: reason.trim() },
                  "Recorded, and logged against your name.",
                )
              }
            >
              {phase === "sending" ? "Recording" : `Yes, ${verdict} it`}
            </button>
            <button
              type="button"
              className="sy-btn sy-btn--quiet"
              disabled={phase === "sending"}
              onClick={() => {
                setPhase("idle");
                setError(null);
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </section>
  );
}
