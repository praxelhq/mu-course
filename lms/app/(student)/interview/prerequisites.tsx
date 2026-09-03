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
  const [warnings, setWarnings] = useState<Partial<Record<Kind, string | undefined>>>({});
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
      // The file is stored either way, but an unreadable one leaves the
      // interview with nothing to quote — say so now, not mid-interview.
      if (commitBody.readable === false && commitBody.unreadableReason) {
        setWarnings((prev) => ({ ...prev, [kind]: commitBody.unreadableReason as string }));
      } else {
        setWarnings((prev) => ({ ...prev, [kind]: undefined }));
      }
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
          const warning = warnings[slot.kind];
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
                style={{ fontSize: "0.875rem" }}
              />
              {busy === slot.kind && (
                <p style={{ margin: "0.5rem 0 0", color: "var(--clay)" }}>Uploading…</p>
              )}
              {row && busy !== slot.kind && (
                <p style={{ margin: "0.5rem 0 0", color: "var(--charcoal)" }}>
                  {label[row.kind]} on file. Uploading again replaces it.
                </p>
              )}
              {error && (
                <p style={{ margin: "0.5rem 0 0", color: "var(--ochre)" }} role="alert">
                  {error}
                </p>
              )}
              {warning && !error && (
                <p style={{ margin: "0.5rem 0 0", color: "var(--ochre)", lineHeight: 1.55 }} role="alert">
                  {warning}
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
