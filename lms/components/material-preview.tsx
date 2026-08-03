"use client";

import { useState } from "react";

// "Peek" — inline material preview. CSV renders as a mono table (Sand
// borders, sticky header); PDFs embed; images inline. Data comes from
// /api/materials/[id]/preview (auth + gates enforced server-side).

type PreviewData =
  | { type: "csv"; headers: string[]; rows: string[][]; truncated: boolean }
  | { type: "pdf" | "image"; url: string };

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.75rem",
};

export function MaterialPreview({ materialId, title }: { materialId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewData | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/materials/${materialId}/preview`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Preview failed (${res.status})`);
      }
      setData((await res.json()) as PreviewData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={toggle} style={peekButton}>
        {open ? "Close" : "Peek"}
      </button>
      {open && (
        <div style={{ gridColumn: "1 / -1", border: "1px solid var(--sand)", marginTop: "0.5rem" }}>
          {loading && (
            <p style={{ ...mono, color: "var(--clay)", margin: 0, padding: "0.75rem" }}>
              Loading preview…
            </p>
          )}
          {error && (
            <p style={{ ...mono, color: "var(--clay)", margin: 0, padding: "0.75rem" }}>{error}</p>
          )}
          {data?.type === "csv" && (
            <div style={{ maxHeight: "24rem", overflow: "auto" }}>
              <table style={{ ...mono, borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {data.headers.map((h, i) => (
                      <th
                        key={i}
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "var(--parchment)",
                          borderBottom: "1px solid var(--sand)",
                          borderRight: "1px solid var(--sand)",
                          padding: "0.375rem 0.625rem",
                          textAlign: "left",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td
                          key={c}
                          style={{
                            borderBottom: "1px solid var(--sand)",
                            borderRight: "1px solid var(--sand)",
                            padding: "0.25rem 0.625rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.truncated && (
                <p style={{ ...mono, color: "var(--clay)", margin: 0, padding: "0.5rem 0.625rem" }}>
                  Preview of the first {data.rows.length} rows — download for the full file.
                </p>
              )}
            </div>
          )}
          {data?.type === "pdf" && (
            <embed
              src={data.url}
              type="application/pdf"
              title={title}
              style={{ width: "100%", height: "28rem" }}
            />
          )}
          {data?.type === "image" && (
            // Presigned S3 URL — next/image cannot optimise short-lived signed URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.url} alt={title} style={{ maxWidth: "100%", display: "block" }} />
          )}
        </div>
      )}
    </>
  );
}

const peekButton: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.6875rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  background: "var(--parchment)",
  color: "var(--pine)",
  border: "1px solid var(--sand)",
  padding: "0.375rem 0.75rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
