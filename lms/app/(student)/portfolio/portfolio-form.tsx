"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import type { PortfolioLink } from "@/lib/portfolio";

// Client half of the portfolio page: narrative textarea + external
// links manager (add/remove {label,url}), saved together via POST
// /api/portfolio (always the session user's own entry).

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-sans)",
  fontSize: "0.9375rem",
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  padding: "0.5rem 0.75rem",
  color: "var(--ink)",
  width: "100%",
};

export function PortfolioForm({
  initialNarrative,
  initialLinks,
}: {
  initialNarrative: string;
  initialLinks: PortfolioLink[];
}) {
  const router = useRouter();
  const [narrative, setNarrative] = useState(initialNarrative);
  const [links, setLinks] = useState<PortfolioLink[]>(initialLinks);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function addLink() {
    const label = newLabel.trim();
    const url = newUrl.trim();
    if (!label || !/^https?:\/\/\S+$/.test(url)) {
      setMsg({ ok: false, text: "A link needs a label and an http(s) URL." });
      return;
    }
    setLinks((l) => [...l, { label, url }]);
    setNewLabel("");
    setNewUrl("");
    setMsg(null);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narrative, links }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; issues?: string[] } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.issues?.join("; ") ?? body?.error ?? `Save failed (${res.status})` });
        return;
      }
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Save failed — network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Narrative &amp; links</h2>

      <label style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", display: "block", margin: "0 0 0.25rem" }}>
        Your narrative — the story of what you built and why it matters
      </label>
      <textarea
        rows={6}
        value={narrative}
        onChange={(e) => setNarrative(e.target.value)}
        style={{ ...inputStyle, resize: "vertical" }}
      />

      <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "1.25rem 0 0.5rem" }}>
        External links
      </p>
      {links.length === 0 ? (
        <p style={{ color: "var(--charcoal)", margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
          No external links yet — add your GitHub, live apps, or published work.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 0.75rem", padding: 0 }}>
          {links.map((l, i) => (
            <li
              key={`${l.url}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                borderBottom: "1px solid var(--sand)",
                padding: "0.5rem 0",
                fontSize: "0.875rem",
              }}
            >
              <span style={{ overflowWrap: "anywhere" }}>
                <strong>{l.label}</strong>
                <span style={{ color: "var(--charcoal)" }}> · {l.url}</span>
              </span>
              <button
                type="button"
                onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
                style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", border: "none", background: "none", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <input
          placeholder="Label (e.g. GitHub)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          style={{ ...inputStyle, maxWidth: "14rem" }}
        />
        <input
          type="url"
          placeholder="https://…"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: "16rem" }}
        />
        <button
          type="button"
          onClick={addLink}
          style={{
            ...mono,
            fontSize: "0.625rem",
            border: "1px solid var(--sand)",
            background: "var(--parchment)",
            color: "var(--pine)",
            padding: "0.5rem 0.75rem",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Add link
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save portfolio"}
        </Button>
        {msg && (
          <span style={{ ...mono, fontSize: "0.625rem", color: msg.ok ? "var(--pine)" : "var(--ochre)" }}>
            {msg.text}
          </span>
        )}
      </div>
    </Card>
  );
}
