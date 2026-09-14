"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/markdown";

// The checkpoint editor. Six rows, each one unfolding into the whole row —
// bar, rubric, gate, signals, field schema, deadline, cooldowns — because an
// artifact kind is a database row and changing one must never need a deploy
// (CLAUDE.md invariant).
//
// Every rule `lib/shipyard/checkpoint-admin.ts` enforces is mirrored here as a
// HINT, not as a gate: the server is still the only thing that decides, and it
// owns the wording. What the mirror buys is that a person pasting a rubric does
// not have to round-trip to learn they left a comma in it.

export type CheckpointRow = {
  id: string;
  key: string;
  order: number;
  title: string;
  barMarkdown: string;
  rubric: unknown;
  gateType: "review" | "metric" | "both";
  acceptsImages: boolean;
  fieldSchema: unknown;
  metricSignals: string[];
  deadlineAt: string | null;
  resubmitWindowHours: number;
  resubmitCooldownMinutes: number;
  updatedAt: string;
};

const SIGNAL_LABELS: Record<string, string> = {
  paymentsLive: "Payments live",
  trackerConnected: "Tracker connected",
  workflowTenRuns: "Ten workflow runs",
  hasPayingCustomer: "A paying customer",
  noBlockingFlags: "No blocking flags",
};

/** ISO → the value a `datetime-local` input wants, in the browser's own zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const pretty = (v: unknown) => JSON.stringify(v ?? null, null, 2);

export function CheckpointList({
  checkpoints,
  knownSignals,
}: {
  checkpoints: CheckpointRow[];
  knownSignals: string[];
}) {
  return (
    <div className="sy-cplist">
      {checkpoints.map((cp) => (
        <CheckpointEditor key={cp.id} checkpoint={cp} knownSignals={knownSignals} />
      ))}
    </div>
  );
}

function CheckpointEditor({
  checkpoint,
  knownSignals,
}: {
  checkpoint: CheckpointRow;
  knownSignals: string[];
}) {
  const id = useId();
  const router = useRouter();

  const [title, setTitle] = useState(checkpoint.title);
  const [bar, setBar] = useState(checkpoint.barMarkdown);
  const [rubric, setRubric] = useState(() => pretty(checkpoint.rubric));
  const [fieldSchema, setFieldSchema] = useState(() => pretty(checkpoint.fieldSchema));
  const [gateType, setGateType] = useState(checkpoint.gateType);
  const [acceptsImages, setAcceptsImages] = useState(checkpoint.acceptsImages);
  const [signals, setSignals] = useState<string[]>(checkpoint.metricSignals);
  const [deadline, setDeadline] = useState(() => toLocalInput(checkpoint.deadlineAt));
  const [windowHours, setWindowHours] = useState(String(checkpoint.resubmitWindowHours));
  const [cooldown, setCooldown] = useState(String(checkpoint.resubmitCooldownMinutes));

  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const rubricHint = useMemo(() => checkRubric(rubric), [rubric]);
  const fieldHint = useMemo(() => checkFieldSchema(fieldSchema), [fieldSchema]);
  const gateHint = useMemo(() => checkGate(gateType, signals), [gateType, signals]);
  const barHint = bar.trim().length < 40 ? "The bar is what a student reads. Write it out in full." : null;
  const titleHint =
    title.trim().length === 0 || title.trim().length > 160 ? "A title is 1 to 160 characters." : null;

  const hint = titleHint ?? barHint ?? rubricHint ?? fieldHint ?? gateHint;

  // Dirt is decided on the raw strings, never by parsing: an editor holding a
  // half-typed rubric is still an editor with unsaved changes, and parsing to
  // find that out would throw during render.
  const changed =
    title !== checkpoint.title ||
    bar !== checkpoint.barMarkdown ||
    rubric !== pretty(checkpoint.rubric) ||
    fieldSchema !== pretty(checkpoint.fieldSchema) ||
    gateType !== checkpoint.gateType ||
    acceptsImages !== checkpoint.acceptsImages ||
    signals.join("|") !== checkpoint.metricSignals.join("|") ||
    deadline !== toLocalInput(checkpoint.deadlineAt) ||
    Number(windowHours) !== checkpoint.resubmitWindowHours ||
    Number(cooldown) !== checkpoint.resubmitCooldownMinutes;

  /** Only ever called once the hints are clear, so the parses cannot throw. */
  function patch(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (title !== checkpoint.title) out.title = title;
    if (bar !== checkpoint.barMarkdown) out.barMarkdown = bar;
    if (rubric !== pretty(checkpoint.rubric)) out.rubric = JSON.parse(rubric);
    if (fieldSchema !== pretty(checkpoint.fieldSchema)) out.fieldSchema = JSON.parse(fieldSchema);
    if (gateType !== checkpoint.gateType) out.gateType = gateType;
    if (acceptsImages !== checkpoint.acceptsImages) out.acceptsImages = acceptsImages;
    if (signals.join("|") !== checkpoint.metricSignals.join("|")) out.metricSignals = signals;
    if (deadline !== toLocalInput(checkpoint.deadlineAt)) {
      out.deadlineAt = deadline === "" ? null : new Date(deadline).toISOString();
    }
    if (Number(windowHours) !== checkpoint.resubmitWindowHours) {
      out.resubmitWindowHours = Number(windowHours);
    }
    if (Number(cooldown) !== checkpoint.resubmitCooldownMinutes) {
      out.resubmitCooldownMinutes = Number(cooldown);
    }
    return out;
  }

  async function save() {
    if (busy || hint) return;
    const body = patch();
    if (Object.keys(body).length === 0) return;
    setBusy("save");
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/shipyard/admin/checkpoints/${checkpoint.key}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        sweep?: { products: number; failed: number } | null;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? `That did not go through (${res.status}).`);
        return;
      }
      setDone(
        data?.sweep
          ? `Saved. The gate change swept ${data.sweep.products} products${data.sweep.failed ? `, ${data.sweep.failed} failed` : ""}.`
          : "Saved. No gate could move, so nothing was swept.",
      );
      router.refresh();
    } catch {
      setError("That did not reach the server. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  async function resetToSeed() {
    setBusy("reset");
    setError(null);
    setDone(null);
    try {
      const res = await fetch(
        `/api/shipyard/admin/checkpoints/reset-to-seed/${checkpoint.key}`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        checkpoint?: CheckpointRow;
        sweep?: { products: number; failed: number } | null;
      } | null;
      if (!res.ok || !data?.checkpoint) {
        setError(data?.error ?? `That did not go through (${res.status}).`);
        return;
      }
      const c = data.checkpoint;
      setTitle(c.title);
      setBar(c.barMarkdown);
      setRubric(pretty(c.rubric));
      setFieldSchema(pretty(c.fieldSchema));
      setGateType(c.gateType);
      setAcceptsImages(c.acceptsImages);
      setSignals(c.metricSignals);
      setWindowHours(String(c.resubmitWindowHours));
      setCooldown(String(c.resubmitCooldownMinutes));
      setDone(
        data.sweep
          ? `Back to seed. Swept ${data.sweep.products} products.`
          : "Back to seed. The deadline is left as it was.",
      );
      setResetArmed(false);
      router.refresh();
    } catch {
      setError("That did not reach the server. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="sy-cpedit">
      <summary>
        <span className="sy-mono sy-cpedit__n">{checkpoint.order}</span>
        <span className="sy-cpedit__title">{checkpoint.title}</span>
        <span className="sy-cpedit__gate sy-mono">{checkpoint.gateType}</span>
        {changed && <span className="sy-cpedit__dirty">edited</span>}
      </summary>

      <div className="sy-cpedit__body">
        <div className="sy-field">
          <label className="sy-field__label" htmlFor={`${id}-title`}>
            Title
          </label>
          <input
            id={`${id}-title`}
            className="sy-input"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="sy-cpedit__split">
          <div className="sy-field">
            <label className="sy-field__label" htmlFor={`${id}-bar`}>
              The bar <span className="sy-field__help">markdown · students read this</span>
            </label>
            <textarea
              id={`${id}-bar`}
              className="sy-textarea sy-textarea--tall"
              value={bar}
              onChange={(e) => setBar(e.target.value)}
            />
          </div>
          <div>
            <p className="sy-field__label">Preview</p>
            <div className="sy-bar sy-cpedit__preview">
              <Markdown>{bar}</Markdown>
            </div>
          </div>
        </div>

        <div className="sy-cpedit__split">
          <div className="sy-field">
            <label className="sy-field__label" htmlFor={`${id}-rubric`}>
              Rubric <span className="sy-field__help">JSON · never shown to a student</span>
            </label>
            <textarea
              id={`${id}-rubric`}
              className="sy-textarea sy-textarea--tall sy-mono"
              spellCheck={false}
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
            />
            {rubricHint && <p className="sy-field__error">{rubricHint}</p>}
          </div>

          <div className="sy-field">
            <label className="sy-field__label" htmlFor={`${id}-fields`}>
              Field schema <span className="sy-field__help">JSON · the submit form</span>
            </label>
            <textarea
              id={`${id}-fields`}
              className="sy-textarea sy-textarea--tall sy-mono"
              spellCheck={false}
              value={fieldSchema}
              onChange={(e) => setFieldSchema(e.target.value)}
            />
            {fieldHint && <p className="sy-field__error">{fieldHint}</p>}
          </div>
        </div>

        <div className="sy-cpedit__row">
          <div className="sy-field">
            <label className="sy-field__label" htmlFor={`${id}-gate`}>
              Gate
            </label>
            <select
              id={`${id}-gate`}
              className="sy-input sy-select"
              value={gateType}
              onChange={(e) => setGateType(e.target.value as CheckpointRow["gateType"])}
            >
              <option value="review">review</option>
              <option value="metric">metric</option>
              <option value="both">both</option>
            </select>
          </div>

          <div className="sy-field">
            <label className="sy-field__label" htmlFor={`${id}-deadline`}>
              Deadline
            </label>
            <input
              id={`${id}-deadline`}
              className="sy-input"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div className="sy-field">
            <label className="sy-field__label" htmlFor={`${id}-window`}>
              Resubmit window <span className="sy-field__help">hours</span>
            </label>
            <input
              id={`${id}-window`}
              className="sy-input"
              type="number"
              min={0}
              max={8760}
              value={windowHours}
              onChange={(e) => setWindowHours(e.target.value)}
            />
          </div>

          <div className="sy-field">
            <label className="sy-field__label" htmlFor={`${id}-cool`}>
              Cooldown <span className="sy-field__help">minutes</span>
            </label>
            <input
              id={`${id}-cool`}
              className="sy-input"
              type="number"
              min={0}
              max={10080}
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
            />
          </div>
        </div>

        <fieldset className="sy-fieldset">
          <legend className="sy-field__label">Tracker signals that clear this gate</legend>
          <div className="sy-checks">
            {knownSignals.map((name) => (
              <label className="sy-check" key={name}>
                <input
                  type="checkbox"
                  checked={signals.includes(name)}
                  onChange={(e) =>
                    setSignals((prev) =>
                      e.target.checked ? [...prev, name] : prev.filter((s) => s !== name),
                    )
                  }
                />
                {SIGNAL_LABELS[name] ?? name}
              </label>
            ))}
          </div>
          {gateHint && <p className="sy-field__error">{gateHint}</p>}
        </fieldset>

        <label className="sy-check">
          <input
            type="checkbox"
            checked={acceptsImages}
            onChange={(e) => setAcceptsImages(e.target.checked)}
          />
          The reviewer is shown images for this checkpoint
        </label>

        {error && (
          <p className="sy-field__error" role="alert">
            {error}
          </p>
        )}
        {done && <p className="sy-action__done">{done}</p>}

        <div className="sy-actions">
          <button
            type="button"
            className="sy-btn"
            disabled={busy !== null || !changed || hint !== null}
            onClick={save}
          >
            {busy === "save" ? "Saving" : "Save checkpoint"}
          </button>
          {!resetArmed ? (
            <button
              type="button"
              className="sy-btn sy-btn--quiet"
              disabled={busy !== null}
              onClick={() => setResetArmed(true)}
            >
              Reset to seed
            </button>
          ) : (
            <>
              <button
                type="button"
                className="sy-btn sy-btn--quiet"
                disabled={busy !== null}
                onClick={resetToSeed}
              >
                {busy === "reset" ? "Resetting" : "Yes, discard every edit"}
              </button>
              <button
                type="button"
                className="sy-btn sy-btn--quiet"
                disabled={busy !== null}
                onClick={() => setResetArmed(false)}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </details>
  );
}

// --- the client-side mirrors of lib/shipyard/checkpoint-admin.ts ------------

function checkRubric(raw: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return "That is not valid JSON.";
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "A rubric is an object with a `criteria` list.";
  }
  const criteria = (value as { criteria?: unknown }).criteria;
  if (!Array.isArray(criteria)) return "A rubric is an object with a `criteria` list.";
  if (criteria.length === 0) return "A rubric needs at least one criterion.";
  const ids = new Set<string>();
  let weight = 0;
  for (const c of criteria) {
    if (!c || typeof c !== "object") return "Every criterion is an object.";
    const r = c as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id === "") return "Every criterion needs an id.";
    if (ids.has(r.id)) return `Two criteria share the id "${r.id}". Ids must be unique.`;
    ids.add(r.id);
    if (typeof r.clause !== "string" || r.clause === "") {
      return `Criterion "${r.id}" needs the bar clause it judges.`;
    }
    if (typeof r.weight !== "number" || !Number.isFinite(r.weight) || r.weight < 0) {
      return `Criterion "${r.id}" needs a weight of zero or more.`;
    }
    weight += r.weight;
  }
  if (weight <= 0) return "The criteria weights are all zero; nothing would be scored.";
  return null;
}

function checkFieldSchema(raw: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return "That is not valid JSON.";
  }
  if (!Array.isArray(value)) return "A field schema is a list of fields.";
  if (value.length === 0) return "A checkpoint needs at least one field for a student to fill in.";
  const keys = new Set<string>();
  for (const f of value) {
    if (!f || typeof f !== "object") return "Every field is an object.";
    const r = f as Record<string, unknown>;
    if (typeof r.key !== "string" || r.key === "") return "Every field needs a key.";
    if (keys.has(r.key)) return `Two fields share the key "${r.key}".`;
    keys.add(r.key);
    if (typeof r.label !== "string" || r.label === "") return `Field "${r.key}" needs a label.`;
    if (typeof r.kind !== "string") return `Field "${r.key}" needs a kind.`;
  }
  return null;
}

function checkGate(gateType: string, signals: string[]): string | null {
  if (gateType === "review" && signals.length > 0) {
    return "A review gate reads no tracker signals. Clear them, or make it `both`.";
  }
  if (gateType !== "review" && signals.length === 0) {
    return "A metric gate needs at least one tracker signal to clear it.";
  }
  return null;
}
