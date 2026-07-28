"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Client half of the materials manager. File uploads go browser → S3 with a
// presigned PUT (XHR for the progress bar); the app tier never sees bytes.

export type ManagedMaterial = {
  id: string;
  sessionNo: number;
  title: string;
  kind: string;
  s3Key: string | null;
  externalUrl: string | null;
  sizeBytes: number | null;
  sectionIds: string[];
  instructorOnly: boolean;
};

type SectionRef = { id: string; code: string };

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const input: React.CSSProperties = {
  fontFamily: "var(--font-geist-sans)",
  fontSize: "0.9375rem",
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  padding: "0.5rem 0.75rem",
  color: "var(--ink)",
};

const label: React.CSSProperties = {
  ...mono,
  fontSize: "0.625rem",
  color: "var(--clay)",
  display: "block",
  marginBottom: "0.25rem",
};

const FILE_KINDS = ["dataset", "schema-pack", "lab-sheet", "deck"] as const;
const SESSIONS = Array.from({ length: 10 }, (_, i) => i + 1);

function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`S3 upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("S3 upload failed (network)"));
    xhr.send(file);
  });
}

export function MaterialsManager({
  materials,
  sections,
  storageReady,
}: {
  materials: ManagedMaterial[];
  sections: SectionRef[];
  storageReady: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  // Upload form state
  const [sessionNo, setSessionNo] = useState(1);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("dataset");
  const [linkUrl, setLinkUrl] = useState("");
  const [instructorOnly, setInstructorOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const bySession = useMemo(() => {
    const map = new Map<number, ManagedMaterial[]>();
    for (const m of materials) {
      map.set(m.sessionNo, [...(map.get(m.sessionNo) ?? []), m]);
    }
    return map;
  }, [materials]);

  async function jsonFetch(url: string, init: RequestInit): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    return res;
  }

  async function create() {
    setError(null);
    setBusy(true);
    setProgress(null);
    try {
      if (!title.trim()) throw new Error("Give the material a title");
      if (kind === "link") {
        await jsonFetch("/api/materials", {
          method: "POST",
          body: JSON.stringify({ sessionNo, title: title.trim(), kind, externalUrl: linkUrl, instructorOnly }),
        });
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Pick a file to upload");
        const up = await jsonFetch("/api/materials/upload-url", {
          method: "POST",
          body: JSON.stringify({
            sessionNo,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          }),
        });
        const { url, key, headers } = (await up.json()) as {
          url: string;
          key: string;
          headers: Record<string, string>;
        };
        setProgress(0);
        await putWithProgress(url, file, headers, setProgress);
        await jsonFetch("/api/materials", {
          method: "POST",
          body: JSON.stringify({
            sessionNo,
            title: title.trim(),
            kind,
            s3Key: key,
            sizeBytes: file.size,
            instructorOnly,
          }),
        });
      }
      setTitle("");
      setLinkUrl("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await jsonFetch(`/api/materials/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function remove(id: string, matTitle: string) {
    if (!window.confirm(`Delete "${matTitle}"? Students lose access immediately.`)) return;
    setError(null);
    try {
      await jsonFetch(`/api/materials/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {/* Creation form */}
      <section style={{ border: "1px solid var(--sand)", padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Add a material</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
          <div>
            <span style={label}>Session</span>
            <select value={sessionNo} onChange={(e) => setSessionNo(Number(e.target.value))} style={input}>
              {SESSIONS.map((n) => (
                <option key={n} value={n}>
                  Session {n}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 16rem" }}>
            <span style={label}>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...input, width: "100%" }} />
          </div>
          <div>
            <span style={label}>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={input}>
              {FILE_KINDS.map((k) => (
                <option key={k} value={k} disabled={!storageReady}>
                  {k}
                </option>
              ))}
              <option value="link">link</option>
            </select>
          </div>
          {kind === "link" ? (
            <div style={{ flex: "1 1 16rem" }}>
              <span style={label}>URL</span>
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                style={{ ...input, width: "100%" }}
              />
            </div>
          ) : (
            <div>
              <span style={label}>File</span>
              <input ref={fileRef} type="file" disabled={!storageReady} style={{ ...input, padding: "0.375rem" }} />
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", paddingBottom: "0.5rem" }}>
            <input
              type="checkbox"
              checked={instructorOnly}
              onChange={(e) => setInstructorOnly(e.target.checked)}
            />
            <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>Instructor only</span>
          </label>
          <Button onClick={create} disabled={busy || (kind !== "link" && !storageReady)}>
            {busy ? "Working…" : "Add material"}
          </Button>
        </div>
        {progress !== null && (
          <div style={{ marginTop: "1rem", border: "1px solid var(--sand)", height: "0.75rem" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "var(--pine)" }} />
          </div>
        )}
        {error && (
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--ochre)", margin: "0.75rem 0 0" }}>{error}</p>
        )}
      </section>

      {/* Listing by session */}
      {SESSIONS.filter((n) => bySession.has(n)).map((n) => (
        <section key={n} style={{ border: "1px solid var(--sand)", padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Session {n}</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {bySession.get(n)!.map((m) => (
              <li
                key={m.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "1rem",
                  alignItems: "center",
                  borderBottom: "1px solid var(--sand)",
                  padding: "0.75rem 0",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>
                    {m.title}
                    {m.instructorOnly && (
                      <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--ochre)", marginLeft: "0.5rem" }}>
                        Instructor only
                      </span>
                    )}
                  </p>
                  <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0.25rem 0 0" }}>
                    {m.kind}
                    {m.s3Key && ` · ${m.s3Key}`}
                    {m.externalUrl && ` · ${m.externalUrl}`}
                  </p>
                  <p style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)", margin: "0.375rem 0 0" }}>
                    {sections.map((s) => {
                      const on = m.sectionIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          title={`Toggle section ${s.code}`}
                          onClick={() =>
                            patch(m.id, {
                              sectionIds: on
                                ? m.sectionIds.filter((id) => id !== s.id)
                                : [...m.sectionIds, s.id],
                            })
                          }
                          style={{
                            ...mono,
                            fontSize: "0.625rem",
                            border: "1px solid var(--sand)",
                            background: "var(--parchment)",
                            color: on ? "var(--pine)" : "var(--clay)",
                            fontWeight: on ? 700 : 400,
                            padding: "0.125rem 0.375rem",
                            marginRight: "0.25rem",
                            cursor: "pointer",
                          }}
                        >
                          {s.code}
                        </button>
                      );
                    })}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => patch(m.id, { instructorOnly: !m.instructorOnly })}
                    style={rowButton}
                  >
                    {m.instructorOnly ? "Make student-visible" : "Make instructor-only"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m.id, m.title)}
                    style={{ ...rowButton, color: "var(--ochre)" }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const rowButton: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  background: "var(--parchment)",
  color: "var(--pine)",
  border: "1px solid var(--sand)",
  padding: "0.375rem 0.625rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
