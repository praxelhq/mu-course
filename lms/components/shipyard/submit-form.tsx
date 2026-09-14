"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { FieldSpecView } from "@/lib/shipyard/view-models";
import { Countdown } from "./countdown";
import { Notice } from "./notice";
import { formatBytes } from "./format";

// The submit form for one checkpoint, rendered entirely from the checkpoint's
// field schema — adding a field is a row edit, never a change here.
//
// Files are listed, not uploaded: the S3 presign round-trip lands with the
// data layer. What this component already owns is the part students actually
// feel — the cooldown, and a 4xx from the server shown inline in the server's
// own words rather than swallowed into "Something went wrong".

type Values = Record<string, string>;

export function SubmitForm({
  checkpointId,
  fields,
  submitLabel = "Submit for review",
  resubmit = false,
  cooldownUntil = null,
  cooldownLabel = "",
  disabled = false,
  disabledReason,
  onSubmitted,
}: {
  checkpointId: string;
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
  const [values, setValues] = useState<Values>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooling, setCooling] = useState(Boolean(cooldownUntil));

  const set = useCallback((key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
  }, []);

  const addFiles = useCallback((key: string, incoming: FileList | null, max?: number) => {
    if (!incoming || incoming.length === 0) return;
    setFiles((f) => {
      const next = [...(f[key] ?? []), ...Array.from(incoming)];
      return { ...f, [key]: max ? next.slice(0, max) : next };
    });
  }, []);

  const removeFile = useCallback((key: string, index: number) => {
    setFiles((f) => ({ ...f, [key]: (f[key] ?? []).filter((_, i) => i !== index) }));
  }, []);

  const blocked = disabled || cooling;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shipyard/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkpointId,
          fields: values,
          files: Object.fromEntries(
            Object.entries(files).map(([k, list]) => [
              k,
              list.map((f) => ({ name: f.name, contentType: f.type, bytes: f.size })),
            ]),
          ),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(
          body?.message ??
            (res.status >= 500
              ? "The review queue did not accept this. Nothing was lost; try again in a minute."
              : "This submission was not accepted."),
        );
        return;
      }
      onSubmitted?.();
    } catch {
      setError("The submission did not reach us. Check your connection and try again.");
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
          files={files[field.key] ?? []}
          onChange={set}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
        />
      ))}

      {error && (
        <Notice label="Not submitted" tone="problem">
          {error}
        </Notice>
      )}

      <div className="sy-actions">
        <button type="submit" className="sy-btn" disabled={blocked || busy}>
          {busy ? "Sending" : resubmit ? "Resubmit" : submitLabel}
        </button>
        {cooldownUntil && cooling && (
          <Countdown
            until={cooldownUntil}
            initialLabel={cooldownLabel}
            onElapsed={() => setCooling(false)}
          />
        )}
        {disabled && disabledReason && (
          <span className="sy-countdown">{disabledReason}</span>
        )}
      </div>
    </form>
  );
}

function Field({
  idPrefix,
  field,
  value,
  files,
  onChange,
  onAddFiles,
  onRemoveFile,
}: {
  idPrefix: string;
  field: FieldSpecView;
  value: string;
  files: File[];
  onChange: (key: string, value: string) => void;
  onAddFiles: (key: string, files: FileList | null, max?: number) => void;
  onRemoveFile: (key: string, index: number) => void;
}) {
  const id = `${idPrefix}-${field.key}`;
  const helpId = field.help ? `${id}-help` : undefined;
  const isFiles = field.kind === "files" || field.kind === "images";

  return (
    <div className="sy-field">
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
          aria-describedby={helpId}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      ) : isFiles ? (
        <DropZone field={field} files={files} onAdd={onAddFiles} onRemove={onRemoveFile} />
      ) : (
        <input
          id={id}
          className="sy-input"
          type={field.kind === "url" ? "url" : field.kind === "number" ? "number" : "text"}
          inputMode={field.kind === "number" ? "numeric" : undefined}
          placeholder={field.kind === "url" ? "https://" : undefined}
          aria-describedby={helpId}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      )}
    </div>
  );
}

function DropZone({
  field,
  files,
  onAdd,
  onRemove,
}: {
  field: FieldSpecView;
  files: File[];
  onAdd: (key: string, files: FileList | null, max?: number) => void;
  onRemove: (key: string, index: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const noun = field.kind === "images" ? "photographs" : "files";

  return (
    <div>
      <button
        type="button"
        className={over ? "sy-drop sy-drop--over" : "sy-drop"}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onAdd(field.key, e.dataTransfer.files, field.maxFiles);
        }}
      >
        <span className="sy-drop__line">Drop {noun} here, or choose</span>
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
      {files.length > 0 && (
        <ul className="sy-filelist">
          {files.map((f, i) => (
            <li className="sy-filelist__item" key={`${f.name}-${i}`}>
              <span>{f.name}</span>
              <span>
                <span className="sy-filelist__size">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  className="sy-filelist__drop"
                  onClick={() => onRemove(field.key, i)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
