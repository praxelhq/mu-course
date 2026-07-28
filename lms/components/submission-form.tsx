"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, StatusChip } from "@/components/ui";
import type { SubmissionFieldDef } from "@/lib/submission-schema";

// The schema-driven submission form. Rendered ENTIRELY from the
// assignment type's submissionSchema field defs (link/text/writeup/file/
// files): a new AssignmentType row is a working form with zero code changes.
// Files go browser → S3 via presigned PUT (XHR for progress); a failed
// upload is always an explicit failed state with a Retry — never silent.

export type HistoryRow = {
  id: string;
  version: number;
  status: string;
  submittedAt: string | null;
};

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; name: string; pct: number }
  | { phase: "done"; name: string; key: string }
  | { phase: "failed"; name: string; message: string; file: FileHandle };

// Browser File kept for retry without re-picking.
type FileHandle = File;

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

const errStyle: React.CSSProperties = {
  ...mono,
  fontSize: "0.6875rem",
  color: "var(--ochre)",
  margin: "0.375rem 0 0",
};

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
        : reject(new Error(`Upload failed (S3 returned ${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed (network error)"));
    xhr.send(file);
  });
}

type LinkCheck = { state: "unchecked" } | { state: "checking" } | { state: "ok"; status: number } | { state: "dead"; status: number };

export function SubmissionForm({
  assignmentId,
  fields,
  storageReady,
  history,
}: {
  assignmentId: string;
  fields: SubmissionFieldDef[];
  storageReady: boolean;
  history: HistoryRow[];
}) {
  const router = useRouter();
  // One draft id per submit attempt: all files of this attempt group under
  // submissions/{me}/{draftId}/ — the final POST carries the keys.
  const draftId = useMemo(() => crypto.randomUUID(), []);

  const [values, setValues] = useState<Record<string, string>>({});
  // file/files fields → per-field upload slots (files kind holds many).
  const [uploads, setUploads] = useState<Record<string, UploadState[]>>({});
  const [linkChecks, setLinkChecks] = useState<Record<string, LinkCheck>>({});
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [topError, setTopError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ version: number } | null>(null);

  const setUploadSlot = (key: string, idx: number, state: UploadState | null) =>
    setUploads((prev) => {
      const slots = [...(prev[key] ?? [])];
      if (state === null) slots.splice(idx, 1);
      else slots[idx] = state;
      return { ...prev, [key]: slots };
    });

  async function startUpload(fieldKey: string, idx: number, file: File) {
    setUploadSlot(fieldKey, idx, { phase: "uploading", name: file.name, pct: 0 });
    try {
      const res = await fetch("/api/uploads/submission-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          draftId,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Could not get an upload URL (${res.status})`);
      }
      const { url, key, headers } = (await res.json()) as {
        url: string;
        key: string;
        headers: Record<string, string>;
      };
      await putWithProgress(url, file, headers, (pct) =>
        setUploadSlot(fieldKey, idx, { phase: "uploading", name: file.name, pct }),
      );
      setUploadSlot(fieldKey, idx, { phase: "done", name: file.name, key });
    } catch (e) {
      // Explicit failed state + Retry — never silent.
      setUploadSlot(fieldKey, idx, {
        phase: "failed",
        name: file.name,
        message: e instanceof Error ? e.message : "Upload failed",
        file,
      });
    }
  }

  function pickFiles(fieldKey: string, kind: "file" | "files", list: FileList | null) {
    if (!list || list.length === 0) return;
    const existing = uploads[fieldKey] ?? [];
    const files = Array.from(list);
    if (kind === "file") {
      // single-file field: replace slot 0
      setUploads((prev) => ({ ...prev, [fieldKey]: [] }));
      void startUpload(fieldKey, 0, files[0]);
    } else {
      files.forEach((f, i) => void startUpload(fieldKey, existing.length + i, f));
    }
  }

  async function checkLink(fieldKey: string) {
    const url = values[fieldKey]?.trim();
    if (!url) return;
    setLinkChecks((p) => ({ ...p, [fieldKey]: { state: "checking" } }));
    try {
      const res = await fetch("/api/links/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; status?: number } | null;
      if (res.ok && body?.ok) {
        setLinkChecks((p) => ({ ...p, [fieldKey]: { state: "ok", status: body.status ?? 200 } }));
      } else {
        setLinkChecks((p) => ({ ...p, [fieldKey]: { state: "dead", status: body?.status ?? 0 } }));
      }
    } catch {
      setLinkChecks((p) => ({ ...p, [fieldKey]: { state: "dead", status: 0 } }));
    }
  }

  function buildPayload(): { fields: Record<string, unknown>; files: string[] } {
    const out: Record<string, unknown> = {};
    const allKeys: string[] = [];
    for (const def of fields) {
      if (def.kind === "file") {
        const slot = (uploads[def.key] ?? []).find((s) => s.phase === "done");
        if (slot && slot.phase === "done") {
          out[def.key] = slot.key;
          allKeys.push(slot.key);
        }
      } else if (def.kind === "files") {
        const keys = (uploads[def.key] ?? [])
          .filter((s): s is Extract<UploadState, { phase: "done" }> => s.phase === "done")
          .map((s) => s.key);
        if (keys.length > 0) {
          out[def.key] = keys;
          allKeys.push(...keys);
        }
      } else {
        const v = values[def.key]?.trim();
        if (v) out[def.key] = v;
      }
    }
    return { fields: out, files: allKeys };
  }

  const uploading = Object.values(uploads).some((slots) =>
    slots.some((s) => s.phase === "uploading"),
  );

  async function submit() {
    setBusy(true);
    setTopError(null);
    setFieldErrors([]);
    try {
      const payload = buildPayload();
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentId, ...payload }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        errors?: string[];
        submission?: { version: number };
      } | null;
      if (res.status === 422) {
        setFieldErrors(body?.errors ?? [body?.error ?? "Validation failed"]);
        setConfirming(false);
        return;
      }
      if (res.status === 409) {
        // Gate closed in the race window between render and submit.
        setTopError(body?.error ?? "Submissions are closed for this assignment.");
        setConfirming(false);
        return;
      }
      if (!res.ok) {
        setTopError(body?.error ?? `Submit failed (${res.status})`);
        setConfirming(false);
        return;
      }
      setDone({ version: body!.submission!.version });
      router.refresh();
    } catch (e) {
      setTopError(e instanceof Error ? e.message : "Submit failed");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const dateFmt = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  if (done) {
    return (
      <section style={{ border: "1px solid var(--sand)", padding: "2rem", textAlign: "center" }}>
        <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)", margin: "0 0 0.75rem" }}>
          Submitted · Version {done.version}
        </p>
        <h2 style={{ fontSize: "1.375rem", margin: "0 0 0.75rem" }}>Your work is in.</h2>
        <p style={{ color: "var(--charcoal)", margin: "0 0 1.5rem" }}>
          It now sits in the grading queue. You can resubmit any time the assignment is open — each
          resubmission becomes a new version.
        </p>
        <Link
          href="/dashboard"
          style={{
            ...mono,
            fontSize: "0.6875rem",
            color: "var(--cream)",
            background: "var(--pine)",
            border: "1px solid var(--pine)",
            padding: "0.5rem 1rem",
            textDecoration: "none",
          }}
        >
          Back to dashboard
        </Link>
      </section>
    );
  }

  const errorsFor = (key: string) => fieldErrors.filter((m) => m.includes(`"${key}"`));
  const generalErrors = fieldErrors.filter(
    (m) => !fields.some((f) => m.includes(`"${f.key}"`)),
  );

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {!storageReady && fields.some((f) => f.kind === "file" || f.kind === "files") && (
        <p
          style={{
            ...mono,
            fontSize: "0.625rem",
            color: "var(--clay)",
            border: "1px solid var(--sand)",
            padding: "0.75rem 1rem",
            margin: 0,
          }}
        >
          File storage is not configured in this environment — file fields are disabled. Link and
          text fields can still be submitted if the assignment allows it.
        </p>
      )}

      <section style={{ border: "1px solid var(--sand)", padding: "1.5rem", display: "grid", gap: "1.25rem" }}>
        {fields.map((def) => (
          <div key={def.key}>
            <span style={labelStyle}>
              {def.label}
              {def.required ? "" : " · optional"}
            </span>

            {def.kind === "link" && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="url"
                  placeholder="https://…"
                  value={values[def.key] ?? ""}
                  onChange={(e) => {
                    setValues((p) => ({ ...p, [def.key]: e.target.value }));
                    setLinkChecks((p) => ({ ...p, [def.key]: { state: "unchecked" } }));
                  }}
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => void checkLink(def.key)}
                  disabled={!values[def.key]?.trim() || linkChecks[def.key]?.state === "checking"}
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
                  {linkChecks[def.key]?.state === "checking" ? "Checking…" : "Check link"}
                </button>
                {linkChecks[def.key]?.state === "ok" && (
                  <span style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)" }}>OK</span>
                )}
                {linkChecks[def.key]?.state === "dead" && (
                  <span style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)" }}>Dead</span>
                )}
              </div>
            )}

            {def.kind === "text" && (
              <input
                value={values[def.key] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [def.key]: e.target.value }))}
                style={inputStyle}
              />
            )}

            {def.kind === "writeup" && (
              <textarea
                rows={5}
                value={values[def.key] ?? ""}
                onChange={(e) => setValues((p) => ({ ...p, [def.key]: e.target.value }))}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-geist-sans)" }}
              />
            )}

            {(def.kind === "file" || def.kind === "files") && (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <input
                  type="file"
                  multiple={def.kind === "files"}
                  disabled={!storageReady}
                  onChange={(e) => {
                    pickFiles(def.key, def.kind as "file" | "files", e.target.files);
                    e.target.value = "";
                  }}
                  style={{ ...inputStyle, padding: "0.375rem" }}
                />
                {(uploads[def.key] ?? []).map((slot, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: "1px solid var(--sand)",
                      padding: "0.5rem 0.75rem",
                      display: "grid",
                      gap: "0.375rem",
                    }}
                  >
                    {slot.phase === "uploading" && (
                      <>
                        <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
                          {slot.name} · {slot.pct}%
                        </span>
                        <div style={{ border: "1px solid var(--sand)", height: "0.5rem" }}>
                          <div style={{ width: `${slot.pct}%`, height: "100%", background: "var(--pine)" }} />
                        </div>
                      </>
                    )}
                    {slot.phase === "done" && (
                      <span
                        style={{
                          ...mono,
                          fontSize: "0.625rem",
                          color: "var(--pine)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                        }}
                      >
                        <span>{slot.name} · uploaded</span>
                        <button
                          type="button"
                          onClick={() => setUploadSlot(def.key, idx, null)}
                          style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", border: "none", background: "none", cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      </span>
                    )}
                    {slot.phase === "failed" && (
                      <span
                        style={{
                          ...mono,
                          fontSize: "0.625rem",
                          color: "var(--ochre)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                        }}
                      >
                        <span>
                          {slot.name} · FAILED — {slot.message}
                        </span>
                        <span style={{ display: "flex", gap: "0.75rem" }}>
                          <button
                            type="button"
                            onClick={() => void startUpload(def.key, idx, slot.file)}
                            style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)", border: "none", background: "none", cursor: "pointer" }}
                          >
                            Retry
                          </button>
                          <button
                            type="button"
                            onClick={() => setUploadSlot(def.key, idx, null)}
                            style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", border: "none", background: "none", cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        </span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {errorsFor(def.key).map((m) => (
              <p key={m} style={errStyle}>
                {m}
              </p>
            ))}
          </div>
        ))}

        {generalErrors.map((m) => (
          <p key={m} style={errStyle}>
            {m}
          </p>
        ))}
        {topError && <p style={errStyle}>{topError}</p>}

        {!confirming ? (
          <div>
            <Button onClick={() => setConfirming(true)} disabled={busy || uploading}>
              {uploading ? "Waiting for uploads…" : "Review & submit"}
            </Button>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--sand)", padding: "1rem", display: "grid", gap: "0.75rem" }}>
            <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: 0 }}>
              You are about to submit:
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--charcoal)", fontSize: "0.875rem" }}>
              {fields.map((def) => {
                const payload = buildPayload();
                const v = payload.fields[def.key];
                return (
                  <li key={def.key}>
                    <strong>{def.label}:</strong>{" "}
                    {v === undefined
                      ? "— (empty)"
                      : Array.isArray(v)
                        ? `${v.length} file(s)`
                        : typeof v === "string" && v.length > 80
                          ? `${v.slice(0, 80)}…`
                          : String(v)}
                  </li>
                );
              })}
            </ul>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <Button onClick={() => void submit()} disabled={busy}>
                {busy ? "Submitting…" : "Submit"}
              </Button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{
                  ...mono,
                  fontSize: "0.6875rem",
                  border: "1px solid var(--sand)",
                  background: "var(--parchment)",
                  color: "var(--charcoal)",
                  padding: "0.5rem 1rem",
                  cursor: "pointer",
                }}
              >
                Keep editing
              </button>
            </div>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section style={{ border: "1px solid var(--sand)", padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Version history</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.map((h) => (
              <li
                key={h.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  borderBottom: "1px solid var(--sand)",
                  padding: "0.5rem 0",
                }}
              >
                <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--charcoal)" }}>
                  v{h.version}
                  {h.submittedAt && ` · ${dateFmt.format(new Date(h.submittedAt))}`}
                </span>
                <StatusChip status={h.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
