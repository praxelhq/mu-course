"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Button, StatusChip } from "@/components/ui";
import {
  submissionValuePresent,
  type SubmissionFieldDef,
} from "@/lib/submission-schema";

export type HistoryRow = {
  id: string;
  version: number;
  attempt: number;
  status: string;
  submittedAt: string | null;
};

type DraftReceipt = {
  id: string;
  updatedAt: string | null;
  assessmentVersionId: string | null;
  grantId: string | null;
  version: number;
  attempt: number;
};

export type RevisionGrantOption = {
  grantId: string;
  kind: "repair" | "improvement";
  targetVersion: number;
  targetAttempt: number;
  expiresAt: string;
};

type DraftState = "idle" | "unsaved" | "saving" | "saved" | "conflict" | "failed";

type UploadState =
  | { phase: "uploading"; name: string; pct: number }
  | { phase: "inspecting"; name: string }
  | { phase: "clean"; name: string; evidenceId: string }
  | {
      phase: "quarantined";
      name: string;
      evidenceId: string;
      reason: string;
      file: File;
    }
  | { phase: "failed"; name: string; message: string; file: File };

type LinkCheck =
  | { state: "unchecked" }
  | { state: "checking" }
  | { state: "ok"; status: number }
  | { state: "dead"; status: number };

const mono: CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const inputStyle: CSSProperties = {
  fontFamily: "var(--font-geist-sans)",
  fontSize: "0.9375rem",
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  padding: "0.5rem 0.75rem",
  color: "var(--ink)",
  width: "100%",
};

const labelStyle: CSSProperties = {
  ...mono,
  fontSize: "0.625rem",
  color: "var(--clay)",
  display: "block",
  margin: "0 0 0.25rem",
};

const errStyle: CSSProperties = {
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
    for (const [key, value] of Object.entries(headers)) {
      // Browsers set Content-Length from the immutable File body. It remains
      // part of the signature, but XMLHttpRequest forbids setting it manually.
      if (key.toLowerCase() !== "content-length") xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (storage returned ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed (network error)"));
    xhr.send(file);
  });
}

function payloadFor(
  definitions: SubmissionFieldDef[],
  values: Record<string, unknown>,
  uploads: Record<string, UploadState[]>,
): { fields: Record<string, unknown>; evidenceIds: string[] } {
  const output: Record<string, unknown> = {};
  const evidenceIds: string[] = [];
  for (const definition of definitions) {
    if (definition.kind === "file" || definition.kind === "files") {
      const clean = (uploads[definition.key] ?? []).filter(
        (slot): slot is Extract<UploadState, { phase: "clean" }> => slot.phase === "clean",
      );
      const ids = clean.map((slot) => slot.evidenceId);
      if (definition.kind === "file" && ids[0]) output[definition.key] = ids[0];
      if (definition.kind === "files" && ids.length > 0) output[definition.key] = ids;
      evidenceIds.push(...ids);
      continue;
    }

    const value = values[definition.key];
    if (typeof value === "string") {
      if (value.trim()) output[definition.key] = value.trim();
    } else if (Array.isArray(value)) {
      if (value.length > 0) output[definition.key] = value;
    } else if (value !== undefined && value !== null) {
      output[definition.key] = value;
    }
  }
  return { fields: output, evidenceIds };
}

function responseError(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

export function submissionWordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function submissionFieldRequired(
  field: Pick<SubmissionFieldDef, "required" | "requiredFromVersion">,
  boundVersion?: number,
): boolean {
  return (
    field.required ||
    (field.requiredFromVersion !== undefined &&
      boundVersion !== undefined &&
      boundVersion >= field.requiredFromVersion)
  );
}

export function SubmissionForm({
  assignmentId,
  fields,
  anyOf = [],
  storageReady,
  history,
  revisionGrants = [],
}: {
  assignmentId: string;
  fields: SubmissionFieldDef[];
  anyOf?: string[][];
  storageReady: boolean;
  history: HistoryRow[];
  revisionGrants?: RevisionGrantOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [uploads, setUploads] = useState<Record<string, UploadState[]>>({});
  const [linkChecks, setLinkChecks] = useState<Record<string, LinkCheck>>({});
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [topError, setTopError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftReceipt | null>(null);
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ version: number; attempt: number } | null>(null);
  const [selectedGrantId, setSelectedGrantId] = useState(
    revisionGrants.length === 1 ? revisionGrants[0]!.grantId : "",
  );

  const draftRef = useRef<DraftReceipt | null>(null);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const latestSignatureRef = useRef("{}");
  const editedRef = useRef(false);

  const payload = useMemo(() => payloadFor(fields, values, uploads), [fields, uploads, values]);
  const payloadSignature = JSON.stringify(payload.fields);

  useEffect(() => {
    latestSignatureRef.current = payloadSignature;
  }, [payloadSignature]);

  const setDraftReceipt = useCallback((receipt: DraftReceipt) => {
    draftRef.current = receipt;
    setDraft(receipt);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/submissions/draft?assignmentId=${encodeURIComponent(assignmentId)}`,
          { signal: controller.signal },
        );
        const body = (await response.json().catch(() => null)) as
          | {
              error?: string;
              draft?: (DraftReceipt & { fields: Record<string, unknown> }) | null;
              evidence?: {
                id: string;
                fieldKey: string;
                filename: string;
                scanState: "pending" | "clean" | "quarantined" | "deleted";
                quarantineReasonCode: string | null;
              }[];
            }
          | null;
        if (!response.ok) throw new Error(responseError(body, "Could not load the saved draft."));
        if (!body?.draft) return;

        const receipt: DraftReceipt = {
          id: body.draft.id,
          updatedAt: body.draft.updatedAt ? String(body.draft.updatedAt) : null,
          assessmentVersionId: body.draft.assessmentVersionId,
          grantId: body.draft.grantId,
          version: body.draft.version,
          attempt: body.draft.attempt,
        };
        setDraftReceipt(receipt);
        if (receipt.grantId) setSelectedGrantId(receipt.grantId);
        if (editedRef.current) return;

        const restoredValues: Record<string, unknown> = {};
        const restoredUploads: Record<string, UploadState[]> = {};
        const evidenceById = new Map((body.evidence ?? []).map((row) => [row.id, row]));
        for (const definition of fields) {
          const stored = body.draft.fields[definition.key];
          if (definition.kind !== "file" && definition.kind !== "files") {
            if (stored !== undefined) restoredValues[definition.key] = stored;
            continue;
          }
          const ids = Array.isArray(stored) ? stored : typeof stored === "string" ? [stored] : [];
          restoredUploads[definition.key] = ids.flatMap((id) => {
            if (typeof id !== "string") return [];
            const evidence = evidenceById.get(id);
            return evidence?.scanState === "clean"
              ? [{ phase: "clean" as const, name: evidence.filename, evidenceId: evidence.id }]
              : [];
          });
        }
        setValues(restoredValues);
        setUploads(restoredUploads);
        setDraftState("saved");
      } catch (error) {
        if (controller.signal.aborted) return;
        setTopError(error instanceof Error ? error.message : "Could not load the saved draft.");
        setDraftState("failed");
      }
    })();
    return () => controller.abort();
  }, [assignmentId, fields, setDraftReceipt]);

  const persistDraft = useCallback(
    (fieldSnapshot: Record<string, unknown>): Promise<DraftReceipt> => {
      const signature = JSON.stringify(fieldSnapshot);
      const run = async () => {
        setDraftState("saving");
        const current = draftRef.current;
        const response = await fetch("/api/submissions/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assignmentId,
            ...(current?.id ? { draftId: current.id } : {}),
            ...(!current?.id && selectedGrantId ? { grantId: selectedGrantId } : {}),
            ...(current?.updatedAt ? { expectedUpdatedAt: current.updatedAt } : {}),
            fields: fieldSnapshot,
          }),
        });
        const body = (await response.json().catch(() => null)) as
          | { error?: string; draft?: DraftReceipt }
          | null;
        if (!response.ok || !body?.draft) {
          const message = responseError(body, `Draft save failed (${response.status})`);
          if (latestSignatureRef.current === signature) {
            setDraftState(response.status === 409 ? "conflict" : "failed");
            setTopError(message);
          }
          throw new Error(message);
        }
        const receipt = { ...body.draft, updatedAt: String(body.draft.updatedAt) };
        setDraftReceipt(receipt);
        setDraftState(latestSignatureRef.current === signature ? "saved" : "unsaved");
        return receipt;
      };

      const queued = saveChainRef.current.then(run, run);
      saveChainRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [assignmentId, selectedGrantId, setDraftReceipt],
  );

  useEffect(() => {
    if (done) return;
    if (revisionGrants.length > 1 && !selectedGrantId && !draftRef.current) return;
    const fieldSnapshot = JSON.parse(payloadSignature) as Record<string, unknown>;
    if (Object.keys(fieldSnapshot).length === 0 && !draftRef.current) return;
    setDraftState((current) => (current === "saving" ? current : "unsaved"));
    const timer = window.setTimeout(() => {
      void persistDraft(fieldSnapshot).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [done, payloadSignature, persistDraft, revisionGrants.length, selectedGrantId]);

  const updateValue = (key: string, value: unknown) => {
    editedRef.current = true;
    setValues((current) => ({ ...current, [key]: value }));
    setConfirming(false);
    setTopError(null);
    setDraftState((current) => (current === "saving" ? current : "unsaved"));
  };

  const setUploadSlot = (key: string, index: number, state: UploadState | null) => {
    editedRef.current = true;
    setUploads((current) => {
      const slots = [...(current[key] ?? [])];
      if (state === null) slots.splice(index, 1);
      else slots[index] = state;
      return { ...current, [key]: slots };
    });
    setConfirming(false);
  };

  async function startUpload(fieldKey: string, index: number, file: File) {
    setTopError(null);
    if (revisionGrants.length > 1 && !selectedGrantId && !draftRef.current) {
      setTopError("Choose the repair or improvement lane before uploading evidence.");
      return;
    }
    setUploadSlot(fieldKey, index, { phase: "uploading", name: file.name, pct: 0 });
    try {
      const reservationResponse = await fetch("/api/uploads/submission-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          ...(draftRef.current?.id ? { draftId: draftRef.current.id } : {}),
          ...(!draftRef.current?.id && selectedGrantId ? { grantId: selectedGrantId } : {}),
          fieldKey,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      const reserved = (await reservationResponse.json().catch(() => null)) as
        | {
            error?: string;
            draftId?: string;
            draftUpdatedAt?: string;
            assessmentVersionId?: string | null;
            grantId?: string | null;
            version?: number;
            attempt?: number;
            reservationId?: string;
            url?: string;
            headers?: Record<string, string>;
          }
        | null;
      if (
        !reservationResponse.ok ||
        !reserved?.draftId ||
        !reserved.reservationId ||
        !reserved.url ||
        !reserved.headers ||
        reserved.version === undefined ||
        reserved.attempt === undefined
      ) {
        throw new Error(
          responseError(reserved, `Could not reserve an upload (${reservationResponse.status})`),
        );
      }
      setDraftReceipt({
        id: reserved.draftId,
        updatedAt: reserved.draftUpdatedAt ?? null,
        assessmentVersionId: reserved.assessmentVersionId ?? null,
        grantId: reserved.grantId ?? null,
        version: reserved.version,
        attempt: reserved.attempt,
      });
      setDraftState((current) => (current === "idle" ? "saved" : current));

      await putWithProgress(reserved.url, file, reserved.headers, (pct) =>
        setUploadSlot(fieldKey, index, { phase: "uploading", name: file.name, pct }),
      );
      setUploadSlot(fieldKey, index, { phase: "inspecting", name: file.name });

      const commitResponse = await fetch("/api/uploads/submission-commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reservationId: reserved.reservationId }),
      });
      const committed = (await commitResponse.json().catch(() => null)) as
        | {
            error?: string;
            evidence?: {
              id: string;
              scanState: "clean" | "quarantined";
              quarantineReasonCode: string | null;
            };
          }
        | null;
      if (!commitResponse.ok || !committed?.evidence) {
        throw new Error(responseError(committed, `Could not inspect upload (${commitResponse.status})`));
      }
      if (committed.evidence.scanState === "quarantined") {
        setUploadSlot(fieldKey, index, {
          phase: "quarantined",
          name: file.name,
          evidenceId: committed.evidence.id,
          reason: committed.evidence.quarantineReasonCode ?? "inspection_failed",
          file,
        });
      } else {
        setUploadSlot(fieldKey, index, {
          phase: "clean",
          name: file.name,
          evidenceId: committed.evidence.id,
        });
      }
    } catch (error) {
      setUploadSlot(fieldKey, index, {
        phase: "failed",
        name: file.name,
        message: error instanceof Error ? error.message : "Upload failed",
        file,
      });
    }
  }

  function pickFiles(fieldKey: string, kind: "file" | "files", list: FileList | null) {
    if (!list?.length) return;
    const selected = Array.from(list);
    if (kind === "file") {
      setUploads((current) => ({ ...current, [fieldKey]: [] }));
      void startUpload(fieldKey, 0, selected[0]);
      return;
    }
    const offset = uploads[fieldKey]?.length ?? 0;
    selected.forEach((file, index) => void startUpload(fieldKey, offset + index, file));
  }

  async function checkLink(fieldKey: string) {
    const raw = values[fieldKey];
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) return;
    setLinkChecks((current) => ({ ...current, [fieldKey]: { state: "checking" } }));
    try {
      const response = await fetch("/api/links/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; status?: number }
        | null;
      setLinkChecks((current) => ({
        ...current,
        [fieldKey]:
          response.ok && body?.ok
            ? { state: "ok", status: body.status ?? 200 }
            : { state: "dead", status: body?.status ?? 0 },
      }));
    } catch {
      setLinkChecks((current) => ({ ...current, [fieldKey]: { state: "dead", status: 0 } }));
    }
  }

  const processingUpload = Object.values(uploads).some((slots) =>
    slots.some((slot) => slot.phase === "uploading" || slot.phase === "inspecting"),
  );
  const blockedUpload = Object.values(uploads).some((slots) =>
    slots.some((slot) => slot.phase === "failed" || slot.phase === "quarantined"),
  );
  const boundVersion = draft?.version;
  const requiredFilesReady = fields
    .filter((field) => submissionFieldRequired(field, boundVersion) && (field.kind === "file" || field.kind === "files"))
    .every((field) => (uploads[field.key] ?? []).some((slot) => slot.phase === "clean"));
  const anyOfReady = anyOf.every((group) =>
    group.some((key) => submissionValuePresent(payload.fields[key])),
  );
  const needsRevisionSelection = revisionGrants.length > 1 && !draft && !selectedGrantId;

  async function beginReview() {
    setTopError(null);
    setFieldErrors([]);
    if (needsRevisionSelection) {
      setTopError("Choose the repair or improvement lane before saving this draft.");
      return;
    }
    if (processingUpload || blockedUpload) return;
    try {
      await persistDraft(payload.fields);
      setConfirming(true);
    } catch {
      // persistDraft exposes the specific conflict/failure state.
    }
  }

  async function submit() {
    setBusy(true);
    setTopError(null);
    setFieldErrors([]);
    try {
      if (processingUpload || blockedUpload || !requiredFilesReady) {
        throw new Error("Every required file must finish inspection cleanly before submission.");
      }
      if (!anyOfReady) {
        throw new Error("Complete at least one field in every alternative evidence group.");
      }
      const saved = await persistDraft(payload.fields);
      if (latestSignatureRef.current !== JSON.stringify(payload.fields)) {
        throw new Error("The draft changed while saving. Review the latest saved state and try again.");
      }
      const response = await fetch("/api/submissions/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          draftId: saved.id,
          fields: payload.fields,
          evidenceIds: payload.evidenceIds,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            errors?: string[];
            submission?: { version: number; attempt: number };
          }
        | null;
      if (response.status === 422) {
        setFieldErrors(body?.errors ?? [body?.error ?? "Validation failed"]);
        setConfirming(false);
        return;
      }
      if (!response.ok || !body?.submission) {
        setTopError(responseError(body, `Submit failed (${response.status})`));
        setConfirming(false);
        return;
      }
      setDone({ version: body.submission.version, attempt: body.submission.attempt });
      router.refresh();
    } catch (error) {
      setTopError(error instanceof Error ? error.message : "Submit failed");
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
          Submitted · Version {done.version} · Attempt {done.attempt}
        </p>
        <h2 style={{ fontSize: "1.375rem", margin: "0 0 0.75rem" }}>Your work is in.</h2>
        <p style={{ color: "var(--charcoal)", margin: "0 0 1.5rem" }}>
          The immutable receipt is saved. Any improvement or repair appears as a separate,
          one-use revision when it is eligible.
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

  const errorsFor = (key: string) => fieldErrors.filter((message) => message.includes(`"${key}"`));
  const generalErrors = fieldErrors.filter(
    (message) => !fields.some((field) => message.includes(`"${field.key}"`)),
  );
  const draftLabel: Record<DraftState, string> = {
    idle: "Not saved",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    saved: draft ? `Draft saved · V${draft.version} A${draft.attempt}` : "Draft saved",
    conflict: "Save conflict · refresh required",
    failed: "Draft save failed",
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {!storageReady && fields.some((field) => field.kind === "file" || field.kind === "files") && (
        <p style={{ ...errStyle, border: "1px solid var(--sand)", padding: "0.75rem 1rem", margin: 0 }}>
          File storage is unavailable in this environment. Upload fields are disabled.
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void beginReview();
        }}
        style={{ border: "1px solid var(--sand)", padding: "1.5rem", display: "grid", gap: "1.25rem" }}
      >
        <div
          id="submission-draft-state"
          role="status"
          aria-live="polite"
          style={{ ...mono, fontSize: "0.625rem", color: draftState === "conflict" || draftState === "failed" ? "var(--ochre)" : "var(--clay)" }}
        >
          {draftLabel[draftState]}
        </div>

        {revisionGrants.length > 0 && (
          <aside style={{ border: "1px solid var(--sand)", padding: "0.75rem" }}>
            <label htmlFor="submission-revision-grant" style={labelStyle}>
              Revision lane
            </label>
            <select
              id="submission-revision-grant"
              value={selectedGrantId}
              disabled={Boolean(draft)}
              required={revisionGrants.length > 1}
              onChange={(event) => {
                setSelectedGrantId(event.target.value);
                setTopError(null);
              }}
              style={inputStyle}
            >
              {revisionGrants.length > 1 && <option value="">Choose repair or improvement</option>}
              {revisionGrants.map((grant) => (
                <option key={grant.grantId} value={grant.grantId}>
                  {grant.kind === "repair" ? "Repair" : "Improvement"} · V{grant.targetVersion} A{grant.targetAttempt} · expires {dateFmt.format(new Date(grant.expiresAt))}
                </option>
              ))}
            </select>
            <p style={{ margin: "0.5rem 0 0", color: "var(--charcoal)", fontSize: "0.82rem" }}>
              The first draft save locks this exact one-use grant. Choose before entering evidence when more than one lane is available.
            </p>
          </aside>
        )}

        {anyOf.length > 0 && (
          <aside aria-labelledby="submission-alternative-evidence" style={{ border: "1px solid var(--sand)", padding: "0.75rem" }}>
            <p id="submission-alternative-evidence" style={{ ...mono, color: "var(--clay)", margin: "0 0 0.375rem" }}>
              Alternative evidence requirements
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--charcoal)" }}>
              {anyOf.map((group) => (
                <li key={group.join("|")}>
                  Complete at least one: {group.map((key) => fields.find((field) => field.key === key)?.label ?? key).join(" or ")}
                </li>
              ))}
            </ul>
          </aside>
        )}

        {fields.map((definition) => {
          const rawValue = values[definition.key];
          const textValue = typeof rawValue === "string" ? rawValue : "";
          const effectiveRequired = submissionFieldRequired(definition, boundVersion);
          const words = submissionWordCount(textValue);
          const hasWordRange =
            (definition.kind === "text" || definition.kind === "writeup") &&
            (definition.minWords !== undefined || definition.maxWords !== undefined);
          const wordHintId = hasWordRange ? `submission-${definition.key}-words` : undefined;
          const exceedsWordLimit =
            definition.maxWords !== undefined && words > definition.maxWords;
          const helpId = definition.helpText ? `submission-${definition.key}-help` : undefined;
          const messages = errorsFor(definition.key);
          const errorId = messages.length > 0 ? `submission-${definition.key}-error` : undefined;
          const describedBy = [helpId, wordHintId, errorId].filter(Boolean).join(" ") || undefined;
          return (
            <div key={definition.key}>
              {definition.kind === "multiChoice" ? (
                <span id={`submission-${definition.key}-label`} style={labelStyle}>
                  {definition.label}
                  {effectiveRequired
                    ? ""
                    : definition.requiredFromVersion !== undefined
                      ? ` · required from Version ${definition.requiredFromVersion}`
                      : " · optional"}
                </span>
              ) : (
                <label htmlFor={`submission-${definition.key}`} style={labelStyle}>
                  {definition.label}
                  {effectiveRequired
                    ? ""
                    : definition.requiredFromVersion !== undefined
                      ? ` · required from Version ${definition.requiredFromVersion}`
                      : " · optional"}
                  {definition.unit ? ` · ${definition.unit}` : ""}
                </label>
              )}
              {definition.helpText && (
                <p id={helpId} style={{ margin: "0 0 0.5rem", color: "var(--charcoal)", fontSize: "0.8125rem" }}>
                  {definition.helpText}
                </p>
              )}

              {definition.kind === "link" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    id={`submission-${definition.key}`}
                    type="url"
                    placeholder={
                      definition.pathKind === "github-repository"
                        ? "https://github.com/owner/repository"
                        : "https://…"
                    }
                    pattern={
                      definition.pathKind === "github-repository"
                        ? "https://github\\.com/[^/]+/[^/?#]+/?"
                        : definition.httpsOnly
                          ? "https://.*"
                          : undefined
                    }
                    title={
                      definition.pathKind === "github-repository"
                        ? "Enter the HTTPS root URL of a GitHub repository."
                        : undefined
                    }
                    value={textValue}
                    required={effectiveRequired}
                    minLength={definition.minLength}
                    maxLength={definition.maxLength}
                    aria-describedby={describedBy}
                    aria-invalid={messages.length > 0 || exceedsWordLimit}
                    onChange={(event) => {
                      updateValue(definition.key, event.target.value);
                      setLinkChecks((current) => ({ ...current, [definition.key]: { state: "unchecked" } }));
                    }}
                    style={{ ...inputStyle, flex: "1 1 16rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => void checkLink(definition.key)}
                    disabled={!textValue.trim() || linkChecks[definition.key]?.state === "checking"}
                    style={{ ...mono, fontSize: "0.625rem", border: "1px solid var(--sand)", background: "var(--parchment)", color: "var(--pine)", padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}
                  >
                    {linkChecks[definition.key]?.state === "checking" ? "Checking…" : "Check link"}
                  </button>
                  <span role="status" aria-live="polite" style={{ ...mono, fontSize: "0.625rem" }}>
                    {linkChecks[definition.key]?.state === "ok" && (
                      <span style={{ color: "var(--pine)" }}>Link reachable</span>
                    )}
                    {linkChecks[definition.key]?.state === "dead" && (
                      <span style={{ color: "var(--ochre)" }}>Link unavailable — you may still submit it</span>
                    )}
                  </span>
                </div>
              )}

              {definition.kind === "text" && (
                <input
                  id={`submission-${definition.key}`}
                  value={textValue}
                  required={effectiveRequired}
                  minLength={definition.minLength}
                  maxLength={definition.maxLength}
                  aria-describedby={describedBy}
                  aria-invalid={messages.length > 0 || exceedsWordLimit}
                  onChange={(event) => updateValue(definition.key, event.target.value)}
                  style={inputStyle}
                />
              )}

              {definition.kind === "writeup" && (
                <textarea
                  id={`submission-${definition.key}`}
                  rows={5}
                  value={textValue}
                  required={effectiveRequired}
                  minLength={definition.minLength}
                  maxLength={definition.maxLength}
                  aria-describedby={describedBy}
                  aria-invalid={messages.length > 0 || exceedsWordLimit}
                  onChange={(event) => updateValue(definition.key, event.target.value)}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              )}

              {definition.kind === "number" && (
                <input
                  id={`submission-${definition.key}`}
                  type="number"
                  value={typeof rawValue === "number" ? rawValue : ""}
                  required={effectiveRequired}
                  min={definition.min}
                  max={definition.max}
                  step={definition.integer ? 1 : "any"}
                  aria-describedby={describedBy}
                  aria-invalid={messages.length > 0}
                  onChange={(event) => updateValue(definition.key, event.target.value === "" ? "" : Number(event.target.value))}
                  style={inputStyle}
                />
              )}

              {definition.kind === "singleChoice" && (
                <select
                  id={`submission-${definition.key}`}
                  value={textValue}
                  required={effectiveRequired}
                  aria-describedby={describedBy}
                  aria-invalid={messages.length > 0}
                  onChange={(event) => updateValue(definition.key, event.target.value)}
                  style={inputStyle}
                >
                  <option value="">Choose…</option>
                  {(definition.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}

              {definition.kind === "multiChoice" && (
                <fieldset
                  id={`submission-${definition.key}`}
                  aria-labelledby={`submission-${definition.key}-label`}
                  aria-describedby={describedBy}
                  aria-invalid={messages.length > 0}
                  style={{ border: "1px solid var(--sand)", margin: 0, padding: "0.75rem" }}
                >
                  <legend style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>
                    Select all that apply
                    {definition.minSelections !== undefined && ` · at least ${definition.minSelections}`}
                    {definition.maxSelections !== undefined && ` · at most ${definition.maxSelections}`}
                  </legend>
                  {(definition.options ?? []).map((option) => {
                    const selected = Array.isArray(rawValue) && rawValue.includes(option.value);
                    return (
                      <label key={option.value} style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.375rem 0" }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            const current = Array.isArray(rawValue) ? rawValue.filter((value): value is string => typeof value === "string") : [];
                            updateValue(definition.key, selected ? current.filter((value) => value !== option.value) : [...current, option.value]);
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </fieldset>
              )}

              {(definition.kind === "file" || definition.kind === "files") && (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <input
                    id={`submission-${definition.key}`}
                    type="file"
                    accept={definition.acceptedMimeTypes?.join(",")}
                    multiple={definition.kind === "files"}
                    disabled={!storageReady || needsRevisionSelection}
                    aria-describedby={describedBy}
                    aria-invalid={messages.length > 0}
                    onChange={(event) => {
                      pickFiles(
                        definition.key,
                        definition.kind as "file" | "files",
                        event.target.files,
                      );
                      event.target.value = "";
                    }}
                    style={{ ...inputStyle, padding: "0.375rem" }}
                  />
                  {definition.maxBytes !== undefined && (
                    <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--clay)" }}>
                      {definition.maxBytesExclusive ? "Strictly below" : "Up to"} {definition.maxBytes.toLocaleString("en-IN")} bytes
                    </span>
                  )}
                  {(uploads[definition.key] ?? []).map((slot, index) => (
                    <div
                      key={`${slot.name}-${index}`}
                      role={slot.phase === "failed" || slot.phase === "quarantined" ? "alert" : "status"}
                      aria-live="polite"
                      style={{ border: "1px solid var(--sand)", padding: "0.5rem 0.75rem", display: "grid", gap: "0.375rem" }}
                    >
                      {slot.phase === "uploading" && (
                        <>
                          <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>{slot.name} · uploading {slot.pct}%</span>
                          <progress value={slot.pct} max={100} aria-label={`Uploading ${slot.name}`} style={{ width: "100%" }} />
                        </>
                      )}
                      {slot.phase === "inspecting" && <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>{slot.name} · inspecting type and contents…</span>}
                      {slot.phase === "clean" && (
                        <span style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)", display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                          <span>{slot.name} · uploaded and inspection passed · evidence receipt saved</span>
                          <button type="button" aria-label={`Remove ${slot.name}`} onClick={() => setUploadSlot(definition.key, index, null)} style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", border: "none", background: "none" }}>Remove</button>
                        </span>
                      )}
                      {(slot.phase === "failed" || slot.phase === "quarantined") && (
                        <span style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                          <span>{slot.name} · {slot.phase === "quarantined" ? `blocked by file inspection — ${slot.reason}` : `upload failed — ${slot.message}`}</span>
                          <span style={{ display: "flex", gap: "0.75rem" }}>
                            <button type="button" aria-label={`Retry ${slot.name}`} onClick={() => void startUpload(definition.key, index, slot.file)} style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)", border: "none", background: "none" }}>Retry</button>
                            <button type="button" aria-label={`Remove ${slot.name}`} onClick={() => setUploadSlot(definition.key, index, null)} style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", border: "none", background: "none" }}>Remove</button>
                          </span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {hasWordRange && (
                <p
                  id={wordHintId}
                  style={{
                    ...mono,
                    color: exceedsWordLimit ? "var(--ochre)" : "var(--clay)",
                    margin: "0.375rem 0 0",
                  }}
                >
                  {words} word{words === 1 ? "" : "s"}
                  {definition.minWords !== undefined && definition.maxWords !== undefined
                    ? ` · target ${definition.minWords}–${definition.maxWords}`
                    : definition.minWords !== undefined
                      ? ` · minimum ${definition.minWords}`
                      : ` · maximum ${definition.maxWords}`}
                </p>
              )}

              {messages.length > 0 && (
                <div id={errorId} role="alert">
                  {messages.map((message) => <p key={message} style={errStyle}>{message}</p>)}
                </div>
              )}
            </div>
          );
        })}

        {generalErrors.map((message) => <p key={message} role="alert" style={errStyle}>{message}</p>)}
        {topError && <p role="alert" style={errStyle}>{topError}</p>}

        {!confirming ? (
          <div>
            <Button type="submit" disabled={busy || processingUpload || blockedUpload || needsRevisionSelection}>
              {processingUpload ? "Waiting for inspection…" : blockedUpload ? "Remove or replace blocked files" : draftState === "saving" ? "Saving…" : "Save, review & submit"}
            </Button>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--sand)", padding: "1rem", display: "grid", gap: "0.75rem" }}>
            <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: 0 }}>Final immutable receipt</p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--charcoal)", fontSize: "0.875rem" }}>
              {fields.map((definition) => {
                const value = payload.fields[definition.key];
                return (
                  <li key={definition.key}>
                    <strong>{definition.label}:</strong>{" "}
                    {value === undefined ? "— (empty)" : Array.isArray(value) ? `${value.length} selected/file(s)` : typeof value === "string" && value.length > 80 ? `${value.slice(0, 80)}…` : String(value)}
                  </li>
                );
              })}
            </ul>
            {!requiredFilesReady && <p style={errStyle}>Every required file needs a clean committed receipt.</p>}
            {!anyOfReady && <p role="alert" style={errStyle}>Complete at least one field in every alternative evidence group.</p>}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <Button onClick={() => void submit()} disabled={busy || draftState !== "saved" || !requiredFilesReady || !anyOfReady || processingUpload || blockedUpload || needsRevisionSelection}>
                {busy ? "Submitting…" : draftState !== "saved" ? "Waiting for draft save…" : "Submit"}
              </Button>
              <button type="button" onClick={() => setConfirming(false)} style={{ ...mono, fontSize: "0.6875rem", border: "1px solid var(--sand)", background: "var(--parchment)", color: "var(--charcoal)", padding: "0.5rem 1rem" }}>Keep editing</button>
            </div>
          </div>
        )}
      </form>

      {history.length > 0 && (
        <section style={{ border: "1px solid var(--sand)", padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1.125rem", margin: "0 0 1rem" }}>Version history</h2>
          <ol aria-label="Immutable submission receipts, newest first" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.map((row) => (
              <li key={row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", borderBottom: "1px solid var(--sand)", padding: "0.5rem 0" }}>
                <span style={{ ...mono, fontSize: "0.6875rem", color: "var(--charcoal)" }}>
                  Version {row.version} · attempt {row.attempt}{row.submittedAt && ` · ${dateFmt.format(new Date(row.submittedAt))}`}
                </span>
                <StatusChip status={row.status} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
