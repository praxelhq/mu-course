"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The erasure confirm form: the admin must retype the student's email
// before POST /api/admin/dpdp/delete fires. Success shows the per-table
// deletion counts returned by the route.

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export function DeleteStudentForm({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dpdp/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, confirmEmail }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        deleted?: Record<string, number>;
      } | null;
      if (!res.ok) {
        setError(body?.error ?? `Delete failed (${res.status})`);
        return;
      }
      setResult(
        Object.entries(body?.deleted ?? {})
          .filter(([, n]) => n > 0)
          .map(([table, n]) => `${table}: ${n}`)
          .join(", ") || "nothing to delete",
      );
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <p style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)", margin: "1rem 0 0" }}>
        Deleted — {result}. The audit record is kept.
      </p>
    );
  }

  return (
    <div style={{ marginTop: "1rem", borderTop: "1px solid var(--sand)", paddingTop: "0.75rem" }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ ...mono, fontSize: "0.625rem", color: "#8a3b1c", border: "1px solid #8a3b1c", background: "var(--parchment)", padding: "0.375rem 0.75rem", cursor: "pointer" }}
        >
          Delete student…
        </button>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--charcoal)" }}>
            This erases every row for this student — submissions, grades, interviews, quiz
            attempts, peer reviews, portfolio, notifications — and cannot be undone. Type
            the student&apos;s email to confirm.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={email}
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.8125rem",
                border: "1px solid var(--sand)",
                background: "var(--parchment)",
                padding: "0.5rem 0.75rem",
                color: "var(--ink)",
                flex: 1,
                minWidth: "16rem",
              }}
            />
            <button
              type="button"
              disabled={busy || confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
              onClick={() => void doDelete()}
              style={{
                ...mono,
                fontSize: "0.625rem",
                color: "var(--cream)",
                background: "#8a3b1c",
                border: "1px solid #8a3b1c",
                padding: "0.375rem 0.75rem",
                cursor: busy ? "default" : "pointer",
                opacity: busy || confirmEmail.trim().toLowerCase() !== email.toLowerCase() ? 0.5 : 1,
              }}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)", border: "1px solid var(--sand)", background: "var(--parchment)", padding: "0.375rem 0.75rem", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", margin: 0 }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
