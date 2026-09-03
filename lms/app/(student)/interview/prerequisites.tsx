"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

// The three artifacts a student uploads before their interview. Each one goes
// straight to S3 on a one-time presigned PUT — the app tier never sees bytes.
//
// The interview is a defence of the student's own work, so these are personal
// uploads even where a team already submitted an equivalent artifact.

type Kind = "resume" | "blueprint" | "sector_map";

type Uploaded = {
  kind: Kind;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

const SLOTS: { kind: Kind; title: string; hint: string; accept: string }[] = [
  {
    kind: "resume",
    title: "Your latest resume",
    hint: "PDF or plain text. The interview asks about your own history, so upload the current one.",
    accept: ".pdf,.txt,application/pdf,text/plain",
  },
  {
    kind: "blueprint",
    title: "Your Make blueprint JSON",
    hint: "The blueprint export for the automation you built. You will be asked why it works the way it does.",
    accept: ".json,application/json",
  },
  {
    kind: "sector_map",
    title: "Your sector map",
    hint: "PDF or an image of your map. Expect questions about the parts you own.",
    accept: ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp",
  },
];

/** What is on file, in the student's terms — not "No file chosen". */
function fileSummary(row: Uploaded): string {
  const kb = row.sizeBytes / 1024;
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
  const when = new Date(row.uploadedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  return `Uploaded ${when} · ${size}`;
}

const label: Record<Kind, string> = {
  resume: "Resume",
  blueprint: "Blueprint JSON",
  sector_map: "Sector map",
};

export function InterviewPrerequisites({
  onCompleteChange,
}: {
  onCompleteChange?: (complete: boolean) => void;
}) {
  const [uploaded, setUploaded] = useState<Uploaded[]>([]);
  const [missing, setMissing] = useState<Kind[]>([]);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Kind, string>>>({});
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();
  const notify = useRef(onCompleteChange);
  useEffect(() => {
    notify.current = onCompleteChange;
  }, [onCompleteChange]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/interview/prerequisites", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { uploaded: Uploaded[]; missing: Kind[]; complete: boolean };
    setUploaded(body.uploaded);
    setMissing(body.missing);
    setLoaded(true);
    notify.current?.(body.complete);
    // The start control is server-rendered from the same three rows, so a
    // newly-complete set has to re-render the page that owns it.
    if (body.complete) router.refresh();
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upload(kind: Kind, file: File) {
    setBusy(kind);
    setErrors((prev) => ({ ...prev, [kind]: undefined }));
    try {
      // The server derives the key; the browser never chooses where this lands.
      const presigned = await fetch("/api/interview/prerequisites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "presign",
          kind,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      const presignedBody = await presigned.json();
      if (!presigned.ok) throw new Error(presignedBody.error ?? "Upload could not be prepared.");

      const put = await fetch(presignedBody.url, {
        method: "PUT",
        headers: { ...(presignedBody.headers ?? {}), "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("The file did not reach storage. Please try again.");

      const commit = await fetch("/api/interview/prerequisites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", kind, s3Key: presignedBody.s3Key }),
      });
      const commitBody = await commit.json();
      if (!commit.ok) throw new Error(commitBody.error ?? "The upload could not be recorded.");
      // Deliberately silent when the file could not be parsed. That is our
      // extraction problem, not the student's mistake, and the interview
      // sources the same material from them directly (see buildSystemPrompt).
      // Telling them here would worry them before a graded conversation and
      // invite "it is in the document" as an answer. Instructors still see it.
      await refresh();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [kind]: err instanceof Error ? err.message : "Something went wrong.",
      }));
    } finally {
      setBusy(null);
    }
  }

  const have = new Map(uploaded.map((row) => [row.kind, row]));

  return (
    <Card style={{ marginBottom: "1.5rem" }}>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.75rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--clay)",
        }}
      >
        Before you start
      </p>
      <p style={{ margin: "0.5rem 0 1.25rem", color: "var(--charcoal)", lineHeight: 1.6 }}>
        Upload all three. The interview is a conversation about your own work, so these need to be
        the files you personally worked on — not a teammate&rsquo;s copy.
      </p>

      <div style={{ display: "grid", gap: "1rem" }}>
        {SLOTS.map((slot) => {
          const row = have.get(slot.kind);
          const error = errors[slot.kind];
          return (
            <div
              key={slot.kind}
              style={{ borderTop: "1px solid var(--sand)", paddingTop: "1rem" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  alignItems: "baseline",
                }}
              >
                <strong style={{ fontSize: "0.9375rem" }}>{slot.title}</strong>
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: row ? "var(--pine)" : "var(--clay)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row ? "Uploaded" : "Needed"}
                </span>
              </div>
              <p style={{ margin: "0.25rem 0 0.75rem", color: "var(--charcoal)", lineHeight: 1.55 }}>
                {slot.hint}
              </p>
              {/* The native control renders "No file chosen" forever, which sat
                  directly under an "Uploaded" badge and read as a contradiction.
                  The input is still the real control — just visually replaced by
                  a label so the button text can state what will happen. */}
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 44,
                  padding: "0 1.25rem",
                  border: "1px solid var(--sand)",
                  background: row ? "transparent" : "var(--pine)",
                  color: row ? "var(--pine)" : "var(--parchment)",
                  cursor: busy === null ? "pointer" : "progress",
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  opacity: busy !== null && busy !== slot.kind ? 0.5 : 1,
                }}
              >
                {busy === slot.kind
                  ? "Uploading…"
                  : row
                    ? `Replace ${label[slot.kind].toLowerCase()}`
                    : `Choose ${label[slot.kind].toLowerCase()}`}
                <input
                  type="file"
                  accept={slot.accept}
                  disabled={busy !== null}
                  aria-label={`Upload ${label[slot.kind]}`}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(slot.kind, file);
                  }}
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0 0 0 0)",
                    whiteSpace: "nowrap",
                    border: 0,
                  }}
                />
              </label>
              {row && busy !== slot.kind && (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    color: "var(--pine)",
                    fontSize: "0.875rem",
                  }}
                >
                  ✓ {fileSummary(row)}
                </p>
              )}
              {error && (
                <p style={{ margin: "0.5rem 0 0", color: "var(--ochre)" }} role="alert">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {loaded && missing.length === 0 && (
        <p style={{ margin: "1.25rem 0 0", color: "var(--pine)" }}>
          All three are in. You can begin your interview below.
        </p>
      )}
    </Card>
  );
}
