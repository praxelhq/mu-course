"use client";

import { useId, useState } from "react";

// The demo's "flip the tracker" control, wired to the admin-only
// /api/shipyard/admin/fake-tracker route. It exists so the money, workflow and
// launch gates can be shown moving without a live payment provider — and it is
// rendered only when TRACKER_MODE is not "real", because the route itself
// refuses to write in that mode and a control that always 409s is a lie.

type Result = { ok: boolean; text: string } | null;

export function FakeTrackerForm({ defaultUserId = "" }: { defaultUserId?: string }) {
  const id = useId();
  const [userId, setUserId] = useState(defaultUserId);
  const [paymentsLive, setPaymentsLive] = useState(false);
  const [trackerConnected, setTrackerConnected] = useState(true);
  const [hasPayingCustomer, setHasPayingCustomer] = useState(false);
  const [workflowRuns, setWorkflowRuns] = useState("0");
  const [payingCustomers, setPayingCustomers] = useState("0");
  const [grossTotal, setGrossTotal] = useState("0");
  const [blockingFlags, setBlockingFlags] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    const runs = Number(workflowRuns) || 0;
    try {
      const res = await fetch("/api/shipyard/admin/fake-tracker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim(),
          signals: {
            paymentsLive,
            trackerConnected,
            hasPayingCustomer,
            workflowRuns: runs,
            // The tracker reports the boolean; the count is what the spine
            // shows. Deriving it here keeps the two from disagreeing on screen.
            workflowTenRuns: runs >= 10,
            payingCustomers: Number(payingCustomers) || 0,
            grossTotal: Number(grossTotal) || 0,
            blockingFlags: blockingFlags
              .split(",")
              .map((f) => f.trim())
              .filter((f) => f !== ""),
          },
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; states?: { key: string; state: string }[] }
        | null;
      if (!res.ok) {
        setResult({ ok: false, text: body?.error ?? `Refused (${res.status}).` });
        return;
      }
      const passed = (body?.states ?? []).filter((s) => s.state === "passed").length;
      setResult({ ok: true, text: `Written. ${passed} of six checkpoints now read as cleared.` });
    } catch {
      setResult({ ok: false, text: "That did not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sy-fake" onSubmit={onSubmit} noValidate>
      <label className="sy-field__label" htmlFor={`${id}-user`}>
        Student user id
      </label>
      <input
        id={`${id}-user`}
        className="sy-input sy-mono"
        value={userId}
        placeholder="user_s001"
        onChange={(e) => setUserId(e.target.value)}
      />

      <fieldset className="sy-fake__checks">
        <legend className="sy-eyebrow">Signals</legend>
        <label className="sy-check">
          <input
            type="checkbox"
            checked={paymentsLive}
            onChange={(e) => setPaymentsLive(e.target.checked)}
          />
          paymentsLive
        </label>
        <label className="sy-check">
          <input
            type="checkbox"
            checked={trackerConnected}
            onChange={(e) => setTrackerConnected(e.target.checked)}
          />
          trackerConnected
        </label>
        <label className="sy-check">
          <input
            type="checkbox"
            checked={hasPayingCustomer}
            onChange={(e) => setHasPayingCustomer(e.target.checked)}
          />
          hasPayingCustomer
        </label>
      </fieldset>

      <div className="sy-fake__grid">
        <span>
          <label className="sy-field__label" htmlFor={`${id}-runs`}>
            Workflow runs
          </label>
          <input
            id={`${id}-runs`}
            className="sy-input"
            type="number"
            min={0}
            value={workflowRuns}
            onChange={(e) => setWorkflowRuns(e.target.value)}
          />
        </span>
        <span>
          <label className="sy-field__label" htmlFor={`${id}-payers`}>
            Paying customers
          </label>
          <input
            id={`${id}-payers`}
            className="sy-input"
            type="number"
            min={0}
            value={payingCustomers}
            onChange={(e) => setPayingCustomers(e.target.value)}
          />
        </span>
        <span>
          <label className="sy-field__label" htmlFor={`${id}-gross`}>
            Gross total (cents)
          </label>
          <input
            id={`${id}-gross`}
            className="sy-input"
            type="number"
            min={0}
            value={grossTotal}
            onChange={(e) => setGrossTotal(e.target.value)}
          />
        </span>
      </div>

      <label className="sy-field__label" htmlFor={`${id}-flags`}>
        Blocking flags
      </label>
      <p className="sy-field__help" id={`${id}-flags-help`}>
        Comma separated. Any flag makes every metric signal false, which is how a
        gamed payment fails Launch.
      </p>
      <input
        id={`${id}-flags`}
        className="sy-input sy-mono"
        value={blockingFlags}
        placeholder="self_payment_suspected"
        aria-describedby={`${id}-flags-help`}
        onChange={(e) => setBlockingFlags(e.target.value)}
      />

      {result && (
        <p
          className={result.ok ? "sy-action__done" : "sy-field__error"}
          role={result.ok ? "status" : "alert"}
        >
          {result.text}
        </p>
      )}

      <div className="sy-actions">
        <button type="submit" className="sy-btn" disabled={busy || userId.trim() === ""}>
          {busy ? "Writing" : "Write these signals"}
        </button>
      </div>
    </form>
  );
}
