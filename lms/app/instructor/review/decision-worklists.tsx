"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  InstructorGradeHoldProjection,
  InstructorOpenAppealProjection,
} from "@/lib/assessment-projections";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const input: React.CSSProperties = {
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  color: "var(--ink)",
  fontFamily: "var(--font-geist-sans)",
  fontSize: "0.875rem",
  padding: "0.5rem 0.625rem",
};

type BulkResponse = {
  ok?: boolean;
  needsConfirm?: boolean;
  selectedCount: number;
  readyCount: number;
  impactedGradeIds: string[];
  resolved: { holdId: string; gradeId: string | null }[];
  failures: { holdId: string; reason: string }[];
  error?: string;
};

function responseError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function HoldGroup({ cause, rows }: { cause: string; rows: InstructorGradeHoldProjection[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<BulkResponse | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selection = rows
    .filter((row) => selected.includes(row.holdId))
    .map((row) => ({ holdId: row.holdId, expectedUpdatedAt: row.expectedUpdatedAt }));

  async function mutate(confirmed: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/instructor/grade-holds/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cause,
          selected: selection,
          confirmed,
          ...(confirmed ? { reason: reason.trim() } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as BulkResponse | null;
      if (!response.ok || !body) {
        throw new Error(responseError(body, `Hold resolution failed (${response.status})`));
      }
      setPreview(body);
      if (confirmed) {
        setSelected([]);
        setReason("");
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Hold resolution failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`hold-cause-${cause}`} style={{ border: "1px solid var(--sand)", padding: "1.25rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
        <h3 id={`hold-cause-${cause}`} style={{ fontSize: "1rem", margin: 0 }}>
          {cause.replaceAll("-", " ")}
        </h3>
        <span style={{ ...mono, color: "var(--clay)" }}>{rows.length} open</span>
        <button
          type="button"
          onClick={() => {
            setSelected(selected.length === rows.length ? [] : rows.map((row) => row.holdId));
            setPreview(null);
          }}
          style={{ ...mono, marginLeft: "auto", border: "1px solid var(--sand)", background: "transparent", color: "var(--pine)", padding: "0.375rem 0.625rem" }}
        >
          {selected.length === rows.length ? "Clear selection" : "Select all visible"}
        </button>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0" }}>
        {rows.map((row) => (
          <li key={row.holdId} style={{ borderTop: "1px solid var(--sand)", padding: "0.625rem 0" }}>
            <label style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "0.625rem", alignItems: "start" }}>
              <input
                type="checkbox"
                checked={selected.includes(row.holdId)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, row.holdId]
                      : current.filter((id) => id !== row.holdId),
                  );
                  setPreview(null);
                }}
                aria-label={`Select ${row.display.ownerName}, Version ${row.display.version}, attempt ${row.display.attempt}`}
              />
              <span>
                <strong>{row.display.ownerName}</strong> · {row.display.assignmentTitle} · Version {row.display.version} · attempt {row.display.attempt}
                {row.display.sectionCode && ` · Section ${row.display.sectionCode}`}
                <span style={{ display: "block", color: "var(--charcoal)", marginTop: "0.25rem" }}>{row.reason}</span>
                <Link href={`/instructor/submissions/${row.display.submissionId}`} style={{ ...mono, color: "var(--pine)" }}>
                  Open submission
                </Link>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {!preview ? (
        <button
          type="button"
          disabled={busy || selection.length === 0}
          onClick={() => void mutate(false)}
          style={{ ...mono, color: "var(--cream)", background: "var(--pine)", border: "1px solid var(--pine)", padding: "0.5rem 0.75rem", opacity: busy || selection.length === 0 ? 0.6 : 1 }}
        >
          {busy ? "Checking impact…" : `Review impact for ${selection.length} selected`}
        </button>
      ) : preview.ok ? (
        <div role="status" aria-live="polite">
          <p style={{ color: "var(--pine)", margin: 0 }}>
            Resolved {preview.resolved.length} hold{preview.resolved.length === 1 ? "" : "s"}.
          </p>
          {preview.failures.length > 0 && (
            <p style={{ color: "var(--ochre)", margin: "0.5rem 0 0" }}>
              {preview.failures.length} row{preview.failures.length === 1 ? "" : "s"} were not changed: {preview.failures.map((failure) => failure.reason).join(", ")}.
            </p>
          )}
        </div>
      ) : (
        <div style={{ borderTop: "1px solid var(--sand)", paddingTop: "0.75rem" }}>
          <p style={{ margin: "0 0 0.75rem", lineHeight: 1.6 }}>
            Confirm resolving {preview.readyCount} of {preview.selectedCount} selected holds across {preview.impactedGradeIds.length} grade{preview.impactedGradeIds.length === 1 ? "" : "s"}.
            {preview.failures.length > 0 && ` ${preview.failures.length} stale or mismatched rows will not change.`}
          </p>
          <label htmlFor={`hold-resolution-${cause}`} style={{ ...mono, color: "var(--clay)", display: "block", marginBottom: "0.25rem" }}>
            Audited resolution reason
          </label>
          <textarea
            id={`hold-resolution-${cause}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={2000}
            required
            style={{ ...input, width: "100%", resize: "vertical" }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.625rem" }}>
            <button
              type="button"
              disabled={busy || preview.readyCount === 0 || !reason.trim()}
              onClick={() => void mutate(true)}
              style={{ ...mono, color: "var(--cream)", background: "var(--pine)", border: "1px solid var(--pine)", padding: "0.5rem 0.75rem", opacity: busy || preview.readyCount === 0 || !reason.trim() ? 0.6 : 1 }}
            >
              {busy ? "Resolving selected holds…" : "Confirm selected rows"}
            </button>
            <button type="button" onClick={() => setPreview(null)} style={{ ...mono, color: "var(--charcoal)", background: "transparent", border: "1px solid var(--sand)", padding: "0.5rem 0.75rem" }}>
              Back to selection
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" style={{ color: "var(--ochre)", margin: "0.75rem 0 0" }}>{error}</p>}
    </section>
  );
}

function AppealRow({ appeal }: { appeal: InstructorOpenAppealProjection }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"accepted" | "partially_accepted" | "denied">("accepted");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/instructor/grade-appeals/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appealId: appeal.appealId, outcome, reason: reason.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(body, `Appeal resolution failed (${response.status})`));
      setResolved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Appeal resolution failed.");
    } finally {
      setBusy(false);
    }
  }

  if (resolved) {
    return <li style={{ borderTop: "1px solid var(--sand)", padding: "0.75rem 0", color: "var(--pine)" }}>Appeal resolved as {outcome.replaceAll("_", " ")}.</li>;
  }

  return (
    <li style={{ borderTop: "1px solid var(--sand)", padding: "0.75rem 0" }}>
      <p style={{ margin: "0 0 0.375rem" }}>
        <strong>{appeal.display.ownerName}</strong> · {appeal.display.assignmentTitle} · Version {appeal.display.version} · attempt {appeal.display.attempt}
      </p>
      <p style={{ color: "var(--charcoal)", margin: "0 0 0.625rem" }}>{appeal.reason}</p>
      <Link href={`/instructor/submissions/${appeal.display.submissionId}`} style={{ ...mono, color: "var(--pine)" }}>Open submission</Link>
      <form onSubmit={submit} style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span style={{ ...mono, color: "var(--clay)" }}>Recorded outcome</span>
          <select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)} style={input}>
            <option value="accepted">Accepted</option>
            <option value="partially_accepted">Partially accepted</option>
            <option value="denied">Denied</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span style={{ ...mono, color: "var(--clay)" }}>Audited resolution reason</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={2000} required style={{ ...input, resize: "vertical" }} />
        </label>
        <button type="submit" disabled={busy || !reason.trim()} style={{ ...mono, justifySelf: "start", color: "var(--cream)", background: "var(--pine)", border: "1px solid var(--pine)", padding: "0.5rem 0.75rem", opacity: busy || !reason.trim() ? 0.6 : 1 }}>
          {busy ? "Resolving appeal…" : "Resolve appeal"}
        </button>
      </form>
      {error && <p role="alert" style={{ color: "var(--ochre)", margin: "0.5rem 0 0" }}>{error}</p>}
    </li>
  );
}

export function DecisionWorklists({
  holds,
  appeals,
}: {
  holds: InstructorGradeHoldProjection[];
  appeals: InstructorOpenAppealProjection[];
}) {
  const groups = useMemo(() => {
    const grouped = new Map<string, InstructorGradeHoldProjection[]>();
    for (const hold of holds) {
      if (hold.cause === "appeal") continue;
      grouped.set(hold.cause, [...(grouped.get(hold.cause) ?? []), hold]);
    }
    return [...grouped.entries()];
  }, [holds]);

  return (
    <div style={{ display: "grid", gap: "1.5rem", marginBottom: "2rem" }}>
      <section aria-labelledby="holds-heading">
        <h2 id="holds-heading" style={{ fontSize: "1.25rem", margin: "0 0 0.25rem" }}>Open grade holds</h2>
        <p style={{ color: "var(--charcoal)", margin: "0 0 1rem", lineHeight: 1.6 }}>
          Select explicit visible rows, review impact, then record one audited resolution. Stale rows fail individually.
        </p>
        {groups.length === 0 ? (
          <p style={{ border: "1px solid var(--sand)", padding: "1rem", margin: 0 }}>No non-appeal holds are open.</p>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {groups.map(([cause, rows]) => <HoldGroup key={cause} cause={cause} rows={rows} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="appeals-heading" style={{ border: "1px solid var(--sand)", padding: "1.25rem" }}>
        <h2 id="appeals-heading" style={{ fontSize: "1.25rem", margin: "0 0 0.25rem" }}>Open learner appeals</h2>
        <p style={{ color: "var(--charcoal)", margin: "0 0 0.75rem" }}>Every appeal requires its own recorded outcome and reason.</p>
        {appeals.length === 0 ? (
          <p style={{ margin: 0 }}>No appeals are open.</p>
        ) : (
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {appeals.map((appeal) => <AppealRow key={appeal.appealId} appeal={appeal} />)}
          </ol>
        )}
      </section>
    </div>
  );
}
