"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type ImportResult = {
  created: number;
  skipped: number;
  invalid: number;
  invalidRows: { line: number; raw: string; reason: string }[];
};

export function RosterUploader() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/roster/import", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Import failed (${res.status})`);
      } else {
        setResult(json as ImportResult);
        router.refresh(); // refresh the per-section counts above
      }
    } catch {
      setError("Import failed — network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p style={{ color: "var(--charcoal)", margin: "0 0 1rem", lineHeight: 1.5 }}>
        Upload a CSV shaped <code>name,email,section</code> (header row optional).
        Existing emails are skipped, never overwritten.
      </p>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".csv,text/csv"
          style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.8125rem" }}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Importing…" : "Import roster"}
        </Button>
      </div>

      {error && (
        <p style={{ color: "var(--ochre)", marginTop: "1rem" }}>{error}</p>
      )}

      {result && (
        <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--sand)", paddingTop: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem" }}>
            <strong>{result.created}</strong> created · <strong>{result.skipped}</strong>{" "}
            skipped (already on roster) · <strong>{result.invalid}</strong> invalid
          </p>
          {result.invalidRows.length > 0 && (
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.25rem",
                color: "var(--charcoal)",
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.8125rem",
                lineHeight: 1.7,
              }}
            >
              {result.invalidRows.slice(0, 20).map((r) => (
                <li key={r.line}>
                  line {r.line}: {r.reason}
                </li>
              ))}
              {result.invalidRows.length > 20 && (
                <li>…and {result.invalidRows.length - 20} more</li>
              )}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
