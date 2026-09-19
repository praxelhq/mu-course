"use client";
import type {
  StudioDocument,
  StudioIdea,
  StudioReview,
} from "@/lib/shipyard/studio/contracts";
import type { Evidence } from "@/lib/shipyard/studio/evidence";
export type Appeal = {
  id: string;
  reason: string;
  emailStatus: string;
  decision: string | null;
  decisionNote: string | null;
};
export type Submission = {
  id: string;
  checkpoint: number;
  version: number;
  status: string;
  createdAt: string;
  snapshot: { fields: Record<string, unknown> };
  members: { id: string; email: string; name: string }[];
  review: (StudioReview & { evidence: Evidence[] }) | null;
  appeal: Appeal | null;
};
export type Job = {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  error: string | null;
  payload: { message?: string; query?: string; source?: string };
  result: {
    answer?: string;
    suggestions?: { field: keyof StudioIdea; value: string; why: string }[];
    evidence?: Evidence[];
    sourceIds?: string[];
    notes?: string[];
    workspaceVersion?: number;
  } | null;
};
export type Workspace = {
  id: string;
  name: string;
  version: number;
  document: StudioDocument;
  members: {
    id: string;
    role: string;
    identity: { id: string; email: string; name: string };
  }[];
  invitations: { id: string; email: string; expiresAt: string }[];
  submissions: Submission[];
  jobs: Job[];
  files: { id: string; name: string; kind: string }[];
};
export type State = {
  actor: { id: string; email: string; name: string; staff: boolean };
  workspace: Workspace | null;
};
export type AppealRow = {
  id: string;
  studentEmail: string;
  reason: string;
  emailStatus: string;
  decision: string | null;
  createdAt: string;
  submission: {
    workspaceId: string;
    checkpoint: number;
    version: number;
    status: string;
    workspace: { name: string };
  };
};
export const labels: Record<string, string> = {
  queued: "Waiting for AI",
  running: "In progress",
  passed: "Passed",
  revise: "Changes needed",
  evidence_needed: "Evidence needed",
  awaiting_review: "Review unavailable",
  received: "Submission received",
  superseded: "Earlier version",
  complete: "Complete",
  failed: "Could not complete",
  cancelled: "Cancelled",
};
export async function api(body?: unknown, query = "") {
  const response = await fetch(
    `/api/shipyard/studio${query}`,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Could not reach Shipyard."), {
      status: response.status,
    });
  return data;
}
export const time = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Sources({ items }: { items: Evidence[] }) {
  return (
    <div className="st-sources">
      {items.map((e) => (
        <article className="st-source" key={e.id}>
          <div className="st-source-meta">
            {e.source} · {new Date(e.capturedAt).toLocaleDateString("en-IN")}
          </div>
          <a
            href={/^https?:\/\//.test(e.url) ? e.url : undefined}
            target="_blank"
            rel="noreferrer"
          >
            {e.title} ↗
          </a>
          <p>{e.type}</p>
          <details>
            <summary>Read captured evidence</summary>
            <pre>{e.text}</pre>
          </details>
        </article>
      ))}
    </div>
  );
}
export function Field({
  label,
  value,
  onChange,
  hint,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  hint?: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="st-field">
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Heading({
  number,
  kicker,
  title,
  description,
}: {
  number: string;
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="st-section-heading">
      <div>
        <span className="st-kicker">{kicker}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span className="st-sheet-number">{number}</span>
    </div>
  );
}
