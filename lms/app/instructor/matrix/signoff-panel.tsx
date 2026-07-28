"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MatrixTeamRow } from "@/lib/matrix";

// U8 — per-team company sign-off editor on the matrix page: status
// (none | contacted | signed_off), note, optional evidence upload into the
// signoffs/{teamId}/ namespace via presigned PUT. Writes SignOff + AuditLog
// through POST /api/signoffs (instructor).

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-sans)",
  fontSize: "0.875rem",
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  padding: "0.375rem 0.625rem",
  color: "var(--ink)",
};

const STATUSES = ["none", "contacted", "signed_off"] as const;

function TeamRow({ team, storageReady }: { team: MatrixTeamRow; storageReady: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(team.signOff?.status ?? "none");
  const [note, setNote] = useState(team.signOff?.note ?? "");
  const [evidenceKey, setEvidenceKey] = useState(team.signOff?.evidenceS3Key ?? null);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadEvidence(file: File) {
    setError(null);
    setUploadPct(0);
    try {
      const res = await fetch("/api/uploads/signoff-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: team.id,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Upload URL failed (${res.status})`);
      }
      const { url, key, headers } = (await res.json()) as {
        url: string;
        key: string;
        headers: Record<string, string>;
      };
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`S3 upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("S3 upload failed (network)"));
        xhr.send(file);
      });
      setEvidenceKey(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadPct(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/signoffs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: team.id,
          status,
          note: note.trim() || null,
          evidenceS3Key: evidenceKey,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem",
        alignItems: "center",
        borderBottom: "1px solid var(--sand)",
        padding: "0.75rem 0",
      }}
    >
      <div style={{ minWidth: "12rem" }}>
        <p style={{ margin: 0, fontWeight: 500 }}>{team.name}</p>
        <p style={{ ...mono, fontSize: "0.5625rem", color: "var(--clay)", margin: "0.125rem 0 0" }}>
          {team.sectorName}
        </p>
      </div>
      <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>
      <input
        placeholder="Note — who confirmed, how"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ ...inputStyle, flex: "1 1 14rem" }}
      />
      <input
        ref={fileRef}
        type="file"
        disabled={!storageReady || uploadPct !== null}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadEvidence(f);
        }}
        title={storageReady ? "Upload evidence" : "Storage not configured"}
        style={{ ...inputStyle, padding: "0.25rem", maxWidth: "13rem" }}
      />
      {uploadPct !== null && (
        <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>{uploadPct}%</span>
      )}
      {evidenceKey && (
        <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--pine)" }} title={evidenceKey}>
          evidence ✓
        </span>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        style={{
          ...mono,
          fontSize: "0.625rem",
          color: "var(--cream)",
          background: busy ? "var(--clay)" : "var(--pine)",
          border: "1px solid var(--pine)",
          padding: "0.375rem 0.75rem",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Saving…" : "Save"}
      </button>
      {saved && <span style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)" }}>Saved</span>}
      {error && <span style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)" }}>{error}</span>}
    </li>
  );
}

export function SignoffPanel({
  teams,
  storageReady,
}: {
  teams: MatrixTeamRow[];
  storageReady: boolean;
}) {
  return (
    <section style={{ border: "1px solid var(--sand)", padding: "1.5rem" }}>
      <h2 style={{ fontSize: "1.125rem", margin: "0 0 0.25rem" }}>Company sign-offs</h2>
      <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0 0 1rem" }}>
        Per-team confirmation that the automation is real and in use.
        {!storageReady && " · Storage not configured — evidence uploads disabled."}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {teams.map((t) => (
          <TeamRow key={t.id} team={t} storageReady={storageReady} />
        ))}
      </ul>
    </section>
  );
}
