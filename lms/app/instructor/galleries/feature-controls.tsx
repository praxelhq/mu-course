"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// U11 — instructor featuring controls per gallery card: feature/unfeature
// toggle + caption edit, POSTed to /api/galleries/feature (audited).

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export function FeatureControls({
  galleryItemId,
  featured,
  caption,
}: {
  galleryItemId: string;
  featured: boolean;
  caption: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(caption ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/galleries/feature", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ galleryItemId, ...body }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? `Request failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--sand)",
        paddingTop: "0.75rem",
        display: "grid",
        gap: "0.5rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => post({ featured: !featured })}
          style={{
            ...mono,
            fontSize: "0.625rem",
            background: featured ? "transparent" : "var(--pine)",
            color: featured ? "var(--charcoal)" : "var(--cream)",
            border: `1px solid ${featured ? "var(--sand)" : "var(--pine)"}`,
            padding: "0.375rem 0.75rem",
            cursor: busy ? "default" : "pointer",
          }}
        >
          {featured ? "Unfeature" : "Feature"}
        </button>
        <button
          type="button"
          disabled={busy || text === (caption ?? "")}
          onClick={() => post({ caption: text.trim() === "" ? null : text.trim() })}
          style={{
            ...mono,
            fontSize: "0.625rem",
            background: "transparent",
            color: "var(--pine)",
            border: "1px solid var(--sand)",
            padding: "0.375rem 0.75rem",
            cursor: busy ? "default" : "pointer",
          }}
        >
          Save caption
        </button>
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Caption for the wall…"
        maxLength={500}
        style={{
          fontFamily: "var(--font-geist-sans)",
          fontSize: "0.8125rem",
          border: "1px solid var(--sand)",
          background: "var(--parchment)",
          color: "var(--ink)",
          padding: "0.375rem 0.5rem",
        }}
      />
      {error && (
        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--ochre)" }}>{error}</p>
      )}
    </div>
  );
}
