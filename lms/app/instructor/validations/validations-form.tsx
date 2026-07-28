"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

// U16 — pick a student (email/name filter), choose a kind, write the note,
// POST /api/instructor/validations.

export type StudentOption = { id: string; label: string };

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

const labelStyle: React.CSSProperties = {
  ...mono,
  fontSize: "0.625rem",
  color: "var(--clay)",
  display: "block",
  margin: "0 0 0.25rem",
};

export function ValidationsForm({ students }: { students: StudentOption[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<"external" | "peer">("external");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return students.slice(0, 50);
    return students.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 50);
  }, [filter, students]);

  async function submit() {
    if (!userId || !note.trim()) {
      setMsg({ ok: false, text: "Pick a student and write a note." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/instructor/validations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, kind, note: note.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error ?? `Failed (${res.status})` });
        return;
      }
      setMsg({ ok: true, text: "Validation recorded." });
      setNote("");
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Record a validation</h2>
      <div style={{ display: "grid", gap: "1rem" }}>
        <div>
          <label style={labelStyle} htmlFor="val-filter">Find student (name or email)</label>
          <input
            id="val-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="student001@…"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="val-student">Student</label>
          <select
            id="val-student"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ ...inputStyle, appearance: "auto" }}
          >
            <option value="">— pick a student —</option>
            {filtered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="val-kind">Kind</label>
          <select
            id="val-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "external" | "peer")}
            style={{ ...inputStyle, appearance: "auto", maxWidth: "16rem" }}
          >
            <option value="external">External (company / outside sign-off)</option>
            <option value="peer">Peer</option>
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="val-note">Note — who validated what</label>
          <textarea
            id="val-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Recording…" : "Record validation"}
          </Button>
          {msg && (
            <span style={{ ...mono, fontSize: "0.625rem", color: msg.ok ? "var(--pine)" : "var(--ochre)" }}>
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
