"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FieldSpecView } from "@/lib/shipyard/view-models";
import { Countdown } from "./countdown";
import { Notice } from "./notice";
import { formatBytes } from "./format";

// The submit form for one checkpoint, rendered entirely from the checkpoint's
// field schema — adding a field is a row edit, never a change here.
//
// Files go straight to S3: pick one, the form asks
// /api/shipyard/uploads/presign for a signed PUT, sends the bytes to it, and
// keeps the KEY the route minted. The app tier never sees the bytes (CLAUDE.md
// invariant) and the key is never something the browser chose, which is what
// makes the prefix check in lib/shipyard/submissions a real ownership check.
//
// Every refusal the API can return is rendered where it belongs: a field error
// under its own field, a cooldown as a notice with the clock still running, a
// 409 in the server's own words. Nothing is flattened into "Something went
// wrong" — a student reads these many times and has to know what to change.

type Values = Record<string, string>;

/** One picked file, from selection to a key the submission can carry. */
type Upload = {
  /** Stable across re-renders; the list key and the abort handle. */
  id: string;
  name: string;
  contentType: string;
  bytes: number;
  /** Object URL for an image preview; revoked on removal. */
  previewUrl: string | null;
  status: "uploading" | "done" | "error";
  /** 0–100 while uploading. */
  progress: number;
  /** The S3 key, once the PUT succeeded. */
  key: string | null;
  error: string | null;
};

const IMAGE_TYPES = /^image\//;

let uploadSeq = 0;
const nextUploadId = () => `u${++uploadSeq}`;

/** `image/jpg` is not a media type, but it is what half the world sends. */
function normaliseType(file: File): string {
  const raw = (file.type || "").split(";")[0].trim().toLowerCase();
  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  if (raw) return raw;
  // Some browsers hand over an empty type for HEIC and Markdown.
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "heic") return "image/heic";
  if (ext === "md") return "text/markdown";
  if (ext === "txt") return "text/plain";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}

/**
 * PUT the bytes with progress. `fetch` cannot report upload progress, and a
 * 200MB clip with no readout is indistinguishable from a hung tab.
 *
 * `Content-Length` is dropped deliberately: it is a forbidden header name in
 * the browser, which sets it from the body anyway — and the signature binds the
 * same number, so S3 still rejects a body of any other size.
 */
function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase() === "content-length") continue;
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage refused the upload (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("The upload did not reach storage."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

export function SubmitForm({
  checkpointKey,
  fields,
  submitLabel = "Submit for review",
  resubmit = false,
  cooldownUntil = null,
  cooldownLabel = "",
  disabled = false,
  disabledReason,
  onSubmitted,
}: {
  /** The checkpoint's key — what both API routes address it by. */
  checkpointKey: string;
  fields: FieldSpecView[];
  submitLabel?: string;
  resubmit?: boolean;
  /** ISO time before which a resubmit is refused. */
  cooldownUntil?: string | null;
  /** Server-computed gap at render time, so the first paint matches. */
  cooldownLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  onSubmitted?: () => void;
}) {
  const formId = useId();
  const router = useRouter();
  const [values, setValues] = useState<Values>({});
  const [uploads, setUploads] = useState<Record<string, Upload[]>>({});
  const [busy, setBusy] = useState(false);
  /** Whole-form refusal: a 409, a 429, a 5xx. */
  const [notice, setNotice] = useState<{ label: string; text: string } | null>(null);
  /** Per-field refusals, keyed by field key. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cooling, setCooling] = useState(Boolean(cooldownUntil));
  const [coolUntil, setCoolUntil] = useState<string | null>(cooldownUntil);
  const [coolLabel, setCoolLabel] = useState(cooldownLabel);

  // Object URLs outlive React state unless somebody revokes them.
  const previews = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const set = useCallback((key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => (e[key] === undefined ? e : { ...e, [key]: "" }));
  }, []);

  const patchUpload = useCallback((fieldKey: string, id: string, patch: Partial<Upload>) => {
    setUploads((all) => ({
      ...all,
      [fieldKey]: (all[fieldKey] ?? []).map((u) => (u.id === id ? { ...u, ...patch } : u)),
    }));
  }, []);

  const startUpload = useCallback(
    async (fieldKey: string, file: File, id: string) => {
      const contentType = normaliseType(file);
      try {
        const res = await fetch("/api/shipyard/uploads/presign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            checkpointKey,
            filename: file.name,
            contentType,
            bytes: file.size,
          }),
        });
        const body = (await res.json().catch(() => null)) as
          | { url?: string; key?: string; headers?: Record<string, string>; error?: string }
          | null;
        if (!res.ok || !body?.url || !body.key) {
          // 413, 415 and 503 all arrive with the server's own sentence. A 503
          // ("Storage not configured") is the one a student can work around:
          // the form still submits, minus the file, when the field allows it.
          patchUpload(fieldKey, id, {
            status: "error",
            error: body?.error ?? `Upload refused (${res.status}).`,
          });
          return;
        }
        await putWithProgress(body.url, body.headers ?? {}, file, (pct) =>
          patchUpload(fieldKey, id, { progress: pct }),
        );
        patchUpload(fieldKey, id, { status: "done", progress: 100, key: body.key, error: null });
      } catch (err) {
        patchUpload(fieldKey, id, {
          status: "error",
          error: err instanceof Error ? err.message : "The upload failed.",
        });
      }
    },
    [checkpointKey, patchUpload],
  );

  const addFiles = useCallback(
    (fieldKey: string, incoming: FileList | null, max?: number) => {
      if (!incoming || incoming.length === 0) return;
      const picked = Array.from(incoming);
      setFieldErrors((e) => (e[fieldKey] === undefined ? e : { ...e, [fieldKey]: "" }));

      setUploads((all) => {
        const existing = all[fieldKey] ?? [];
        const room = max ? Math.max(0, max - existing.length) : picked.length;
        const taken = picked.slice(0, room);
        const rows: Upload[] = taken.map((file) => {
          const isImage = IMAGE_TYPES.test(normaliseType(file));
          const previewUrl = isImage ? URL.createObjectURL(file) : null;
          if (previewUrl) previews.current.add(previewUrl);
          const id = nextUploadId();
          // Fire-and-forget: the row is already on screen in `uploading`.
          void startUpload(fieldKey, file, id);
          return {
            id,
            name: file.name,
            contentType: normaliseType(file),
            bytes: file.size,
            previewUrl,
            status: "uploading",
            progress: 0,
            key: null,
            error: null,
          };
        });
        return { ...all, [fieldKey]: [...existing, ...rows] };
      });
    },
    [startUpload],
  );

  const removeUpload = useCallback((fieldKey: string, id: string) => {
    setUploads((all) => {
      const list = all[fieldKey] ?? [];
      const gone = list.find((u) => u.id === id);
      if (gone?.previewUrl) {
        URL.revokeObjectURL(gone.previewUrl);
        previews.current.delete(gone.previewUrl);
      }
      return { ...all, [fieldKey]: list.filter((u) => u.id !== id) };
    });
  }, []);

  const uploading = Object.values(uploads)
    .flat()
    .some((u) => u.status === "uploading");
  const blocked = disabled || cooling;

  /**
   * `validateSubmissionFields` reports errors as "<key>: <sentence>". Split
   * them back apart so each one lands under the field it is about; anything
   * that does not name a known field stays in the notice.
   */
  function spreadFieldErrors(errors: string[]): string[] {
    const known = new Set(fields.map((f) => f.key));
    const perField: Record<string, string> = {};
    const rest: string[] = [];
    for (const raw of errors) {
      const at = raw.indexOf(":");
      const key = at > 0 ? raw.slice(0, at) : "";
      if (known.has(key)) {
        const text = raw.slice(at + 1).trim();
        perField[key] = perField[key] ? `${perField[key]} ${text}` : text;
      } else {
        rest.push(raw);
      }
    }
    setFieldErrors(perField);
    return rest;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || busy || uploading) return;
    setBusy(true);
    setNotice(null);
    setFieldErrors({});
    try {
      // A file-kind field carries the KEYS; the flat `files` list carries the
      // metadata the submission row stores. Both are re-checked server-side.
      const fileFields = new Set(
        fields.filter((f) => f.kind === "files" || f.kind === "images").map((f) => f.key),
      );
      const payloadFields: Record<string, unknown> = { ...values };
      const flatFiles: { key: string; name: string; contentType: string; bytes: number }[] = [];
      for (const key of fileFields) {
        const done = (uploads[key] ?? []).filter((u) => u.status === "done" && u.key);
        if (done.length > 0) payloadFields[key] = done.map((u) => u.key!);
        for (const u of done) {
          flatFiles.push({ key: u.key!, name: u.name, contentType: u.contentType, bytes: u.bytes });
        }
      }
      // Blank optional answers are simply not sent — an empty string is not an
      // answer, and `validateSubmissionFields` treats a missing key correctly.
      for (const [key, value] of Object.entries(payloadFields)) {
        if (typeof value === "string" && value.trim() === "") delete payloadFields[key];
      }

      const res = await fetch("/api/shipyard/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkpointKey, fields: payloadFields, files: flatFiles }),
      });

      if (res.status === 201) {
        setValues({});
        setUploads({});
        onSubmitted?.();
        // The spine is a server component: a refresh is what turns this form
        // into the "in review" panel.
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => null)) as
        | {
            error?: string;
            errors?: string[];
            field?: string;
            nextAllowedResubmitAt?: string;
            humanText?: string;
          }
        | null;

      if (res.status === 400 && body?.field) {
        setFieldErrors({ [body.field]: body.error ?? "This needs fixing." });
        return;
      }
      if (res.status === 400 && Array.isArray(body?.errors)) {
        const rest = spreadFieldErrors(body.errors);
        setNotice({
          label: "Not submitted",
          text:
            rest.length > 0
              ? `${body.error ?? "Some answers need fixing."} ${rest.join(" ")}`
              : (body.error ?? "Some answers need fixing before this can be submitted."),
        });
        return;
      }
      if (res.status === 429) {
        if (body?.nextAllowedResubmitAt) {
          setCoolUntil(body.nextAllowedResubmitAt);
          setCoolLabel(body.humanText ?? "");
          setCooling(true);
        }
        setNotice({ label: "Too soon", text: body?.error ?? "You cannot resubmit yet." });
        return;
      }
      if (res.status === 409) {
        setNotice({ label: "Not accepted", text: body?.error ?? "That checkpoint is not open." });
        return;
      }
      setNotice({
        label: "Not submitted",
        text:
          body?.error ??
          (res.status >= 500
            ? "The review queue did not accept this. Nothing was lost; try again in a minute."
            : "This submission was not accepted."),
      });
    } catch {
      setNotice({
        label: "Not submitted",
        text: "The submission did not reach us. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sy-form" onSubmit={onSubmit} noValidate>
      <p className="sy-eyebrow">{resubmit ? "Your next attempt" : "What you submit"}</p>
      {fields.map((field) => (
        <Field
          key={field.key}
          idPrefix={formId}
          field={field}
          value={values[field.key] ?? ""}
          uploads={uploads[field.key] ?? []}
          error={fieldErrors[field.key] || undefined}
          onChange={set}
          onAddFiles={addFiles}
          onRemoveUpload={removeUpload}
        />
      ))}

      {notice && (
        <Notice label={notice.label} tone="problem">
          {notice.text}
        </Notice>
      )}

      <div className="sy-actions">
        <button type="submit" className="sy-btn" disabled={blocked || busy || uploading}>
          {busy ? "Sending" : uploading ? "Uploading" : resubmit ? "Resubmit" : submitLabel}
        </button>
        {coolUntil && cooling && (
          <Countdown
            until={coolUntil}
            initialLabel={coolLabel}
            onElapsed={() => setCooling(false)}
          />
        )}
        {uploading && <span className="sy-countdown">Files are still uploading</span>}
        {disabled && disabledReason && <span className="sy-countdown">{disabledReason}</span>}
      </div>
    </form>
  );
}

function Field({
  idPrefix,
  field,
  value,
  uploads,
  error,
  onChange,
  onAddFiles,
  onRemoveUpload,
}: {
  idPrefix: string;
  field: FieldSpecView;
  value: string;
  uploads: Upload[];
  error?: string;
  onChange: (key: string, value: string) => void;
  onAddFiles: (key: string, files: FileList | null, max?: number) => void;
  onRemoveUpload: (key: string, id: string) => void;
}) {
  const id = `${idPrefix}-${field.key}`;
  const helpId = field.help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const isFiles = field.kind === "files" || field.kind === "images";

  return (
    <div className={error ? "sy-field sy-field--invalid" : "sy-field"}>
      <label className="sy-field__label" htmlFor={isFiles ? undefined : id}>
        {field.label}
        {field.required && <span className="sy-field__req"> · required</span>}
      </label>
      {field.help && (
        <p className="sy-field__help" id={helpId}>
          {field.help}
        </p>
      )}

      {field.kind === "textarea" ? (
        <textarea
          id={id}
          className="sy-textarea"
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      ) : isFiles ? (
        <DropZone
          field={field}
          uploads={uploads}
          describedBy={describedBy}
          onAdd={onAddFiles}
          onRemove={onRemoveUpload}
        />
      ) : (
        <input
          id={id}
          className="sy-input"
          type={field.kind === "url" ? "url" : field.kind === "number" ? "number" : "text"}
          inputMode={field.kind === "number" ? "numeric" : undefined}
          placeholder={field.kind === "url" ? "https://" : undefined}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )}

      {error && (
        <p className="sy-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function DropZone({
  field,
  uploads,
  describedBy,
  onAdd,
  onRemove,
}: {
  field: FieldSpecView;
  uploads: Upload[];
  describedBy?: string;
  onAdd: (key: string, files: FileList | null, max?: number) => void;
  onRemove: (key: string, id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const noun = field.kind === "images" ? "photographs" : "files";
  const full = field.maxFiles !== undefined && uploads.length >= field.maxFiles;

  return (
    <div>
      <button
        type="button"
        className={over ? "sy-drop sy-drop--over" : "sy-drop"}
        aria-describedby={describedBy}
        disabled={full}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!full) onAdd(field.key, e.dataTransfer.files, field.maxFiles);
        }}
      >
        <span className="sy-drop__line">
          {full ? `That is all ${noun} this checkpoint takes` : `Drop ${noun} here, or choose`}
        </span>
        <span className="sy-drop__hint">
          {field.maxFiles ? `Up to ${field.maxFiles}` : "Any number"} · 200 MB each
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={field.accept}
        className="sy-visually-hidden"
        aria-label={field.label}
        onChange={(e) => {
          onAdd(field.key, e.target.files, field.maxFiles);
          e.target.value = "";
        }}
      />
      {uploads.length > 0 && (
        <ul className="sy-uploads">
          {uploads.map((u) => (
            <li className={`sy-upload sy-upload--${u.status}`} key={u.id}>
              {u.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="sy-upload__thumb" src={u.previewUrl} alt="" />
              ) : (
                <span className="sy-upload__thumb sy-upload__thumb--blank" aria-hidden="true" />
              )}
              <span className="sy-upload__body">
                <span className="sy-upload__name">{u.name}</span>
                <span className="sy-upload__meta">
                  {formatBytes(u.bytes)}
                  {u.status === "uploading" && ` · uploading ${u.progress}%`}
                  {u.status === "done" && " · uploaded"}
                </span>
                {u.status === "uploading" && (
                  <span className="sy-upload__bar" aria-hidden="true">
                    <span className="sy-upload__bar-fill" style={{ width: `${u.progress}%` }} />
                  </span>
                )}
                {u.status === "error" && u.error && (
                  <span className="sy-upload__error" role="alert">
                    {u.error}
                  </span>
                )}
              </span>
              <button
                type="button"
                className="sy-filelist__drop"
                onClick={() => onRemove(field.key, u.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
