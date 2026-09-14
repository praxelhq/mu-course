"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Read it again, now." The one honest thing a student can do about a metric
// gate: the numbers stay entirely the tracker's, but waiting up to fifteen
// minutes for the sweep to notice a payment that already happened is not a
// rule, it is a delay.
//
// The limit is one a minute, and the server says how long is left, so the
// button reports the wait rather than pretending the click did something.

export function RefreshSignals() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setProblem(false);
    try {
      const res = await fetch("/api/shipyard/tracker/refresh-mine", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; retryAfterSeconds?: number; reachedTracker?: boolean }
        | null;

      if (res.status === 429) {
        const secs = body?.retryAfterSeconds;
        setProblem(true);
        setMessage(
          secs && secs > 0
            ? `Just read it. Again in ${secs}s.`
            : (body?.error ?? "Just read it. Try again in a moment."),
        );
        return;
      }
      if (!res.ok) {
        setProblem(true);
        setMessage(body?.error ?? `That did not go through (${res.status}).`);
        return;
      }
      if (body?.reachedTracker === false) {
        // A tracker that did not answer changes nothing — and saying "refreshed"
        // over stale numbers would be the one lie this strip cannot afford.
        setProblem(true);
        setMessage("Shipped.money did not answer. Nothing changed; try again shortly.");
        return;
      }
      setMessage("Read just now.");
      router.refresh();
    } catch {
      setProblem(true);
      setMessage("That did not reach us. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="sy-refresh">
      <button
        type="button"
        className="sy-btn sy-btn--quiet sy-btn--small"
        onClick={refresh}
        disabled={busy}
      >
        {busy ? "Reading" : "Refresh"}
      </button>
      {message && (
        <span
          className={problem ? "sy-refresh__msg sy-refresh__msg--problem" : "sy-refresh__msg"}
          role="status"
        >
          {message}
        </span>
      )}
    </span>
  );
}
