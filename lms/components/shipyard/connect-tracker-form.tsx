"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

// One line, one field, one button: point this product at its Shipped.money
// project. It sits inside the signal strip because that is where the question
// is asked — every signal reads "not read yet" until this is done, and a
// student looking at five blanks deserves the fix in the same frame.
//
// The server's own words are shown verbatim on a 400: `parseTrackerSlug`
// already explains what a project link looks like, and rewording it here would
// mean two sentences to keep in step.

export function ConnectTrackerForm() {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shipyard/product/connect-tracker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(
          body?.error ??
            "That did not connect. Check the link and try again in a moment.",
        );
        return;
      }
      setValue("");
      // Connecting recomputes the gates on the same request, so the spine this
      // refresh fetches already has the new signals in it.
      router.refresh();
    } catch {
      setError("That did not reach us. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sy-connect" onSubmit={onSubmit} noValidate>
      <label className="sy-connect__label" htmlFor={id}>
        Paste your Shipped.money project link
      </label>
      <div className="sy-connect__row">
        <input
          id={id}
          className="sy-input sy-connect__input"
          type="text"
          inputMode="url"
          autoComplete="off"
          placeholder="https://shipped.money/p/your-project"
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="sy-btn sy-btn--small" disabled={busy || !value.trim()}>
          {busy ? "Connecting" : "Connect"}
        </button>
      </div>
      {error && (
        <p className="sy-connect__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
