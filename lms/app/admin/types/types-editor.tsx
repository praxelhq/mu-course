"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import type { FieldKind, SubmissionFieldDef } from "@/lib/submission-schema";

// Client half of the admin type editor: a STRUCTURED field-list editor
// (key/label/kind/required rows — no raw JSON textarea) with a read-only
// JSON preview, plus the rubric dimension editor (4 defaults prefilled).

export type EditableType = {
  id: string;
  slug: string;
  title: string;
  description: string;
  teamBased: boolean;
  galleryEligible: boolean;
  fields: SubmissionFieldDef[];
  rubricDimensions: { key: string; label: string; max: number; description: string }[];
};

const KINDS: FieldKind[] = ["link", "text", "writeup", "file", "files"];

const DEFAULT_RUBRIC_DIMENSIONS = [
  { key: "functionality", label: "Functionality", max: 10, description: "Does it actually work?" },
  { key: "craft", label: "Craft", max: 10, description: "Is the execution good, not just present?" },
  { key: "relevance", label: "Relevance", max: 10, description: "Built for the team's real company/industry?" },
  { key: "verification-evidence", label: "Verification evidence", max: 10, description: "Can the student show they checked their own work?" },
];

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-sans)",
  fontSize: "0.875rem",
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  padding: "0.375rem 0.625rem",
  color: "var(--ink)",
};

const labelStyle: React.CSSProperties = {
  ...mono,
  fontSize: "0.625rem",
  color: "var(--clay)",
  display: "block",
  marginBottom: "0.25rem",
};

type Draft = Omit<EditableType, "id"> & { id: string | null };

const emptyDraft = (): Draft => ({
  id: null,
  slug: "",
  title: "",
  description: "",
  teamBased: false,
  galleryEligible: false,
  fields: [{ key: "", label: "", kind: "text", required: true }],
  rubricDimensions: DEFAULT_RUBRIC_DIMENSIONS.map((d) => ({ ...d })),
});

export function TypesEditor({ types }: { types: EditableType[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(t: EditableType) {
    setError(null);
    setDraft({
      ...t,
      fields: t.fields.map((f) => ({ ...f })),
      rubricDimensions:
        t.rubricDimensions.length > 0
          ? t.rubricDimensions.map((d) => ({ ...d }))
          : DEFAULT_RUBRIC_DIMENSIONS.map((d) => ({ ...d })),
    });
  }

  function setField(idx: number, patch: Partial<SubmissionFieldDef>) {
    setDraft((d) =>
      d
        ? { ...d, fields: d.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)) }
        : d,
    );
  }

  function setDim(idx: number, patch: Partial<Draft["rubricDimensions"][number]>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            rubricDimensions: d.rubricDimensions.map((r, i) =>
              i === idx ? { ...r, ...patch } : r,
            ),
          }
        : d,
    );
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...(draft.id ? { id: draft.id } : {}),
        slug: draft.slug.trim(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        teamBased: draft.teamBased,
        galleryEligible: draft.galleryEligible,
        submissionSchema: { fields: draft.fields },
        rubric: { scale: 10, dimensions: draft.rubricDimensions },
      };
      const res = await fetch("/api/admin/types", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Save failed (${res.status})`);
      }
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {/* Listing */}
      <section style={{ border: "1px solid var(--sand)", padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.125rem", margin: 0 }}>Existing types</h2>
          <Button onClick={() => setDraft(emptyDraft())}>New type</Button>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {types.map((t) => (
            <li
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "1rem",
                alignItems: "center",
                borderBottom: "1px solid var(--sand)",
                padding: "0.75rem 0",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 500 }}>
                  {t.title}
                  <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--clay)", marginLeft: "0.5rem" }}>
                    {t.slug}
                    {t.teamBased && " · team"}
                    {t.galleryEligible && " · gallery"}
                  </span>
                </p>
                <p style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)", margin: "0.25rem 0 0" }}>
                  {t.fields.map((f) => `${f.key}:${f.kind}${f.required ? "" : "?"}`).join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => edit(t)}
                style={{
                  ...mono,
                  fontSize: "0.625rem",
                  border: "1px solid var(--sand)",
                  background: "var(--parchment)",
                  color: "var(--pine)",
                  padding: "0.375rem 0.75rem",
                  cursor: "pointer",
                }}
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Editor */}
      {draft && (
        <section style={{ border: "1px solid var(--sand)", padding: "1.5rem", display: "grid", gap: "1.25rem" }}>
          <h2 style={{ fontSize: "1.125rem", margin: 0 }}>
            {draft.id ? `Edit: ${draft.title || draft.slug}` : "New assignment type"}
          </h2>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <span style={labelStyle}>Slug</span>
              <input
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="data-memo"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: "1 1 16rem" }}>
              <span style={labelStyle}>Title</span>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", paddingTop: "1rem" }}>
              <input
                type="checkbox"
                checked={draft.teamBased}
                onChange={(e) => setDraft({ ...draft, teamBased: e.target.checked })}
              />
              <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>Team-based</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", paddingTop: "1rem" }}>
              <input
                type="checkbox"
                checked={draft.galleryEligible}
                onChange={(e) => setDraft({ ...draft, galleryEligible: e.target.checked })}
              />
              <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>Gallery-eligible</span>
            </label>
          </div>

          <div>
            <span style={labelStyle}>Description</span>
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              style={{ ...inputStyle, width: "100%", resize: "vertical" }}
            />
          </div>

          {/* Structured field-list editor — never a raw JSON textarea */}
          <div>
            <span style={labelStyle}>Submission fields</span>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {draft.fields.map((f, idx) => (
                <div key={idx} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    placeholder="key (e.g. appUrl)"
                    value={f.key}
                    onChange={(e) => setField(idx, { key: e.target.value })}
                    style={{ ...inputStyle, width: "10rem" }}
                  />
                  <input
                    placeholder="Label shown to students"
                    value={f.label}
                    onChange={(e) => setField(idx, { label: e.target.value })}
                    style={{ ...inputStyle, flex: "1 1 14rem" }}
                  />
                  <select
                    value={f.kind}
                    onChange={(e) => setField(idx, { kind: e.target.value as FieldKind })}
                    style={inputStyle}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => setField(idx, { required: e.target.checked })}
                    />
                    <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--charcoal)" }}>required</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, fields: draft.fields.filter((_, i) => i !== idx) })
                    }
                    style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", border: "1px solid var(--sand)", background: "var(--parchment)", padding: "0.375rem 0.5rem", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      fields: [...draft.fields, { key: "", label: "", kind: "text", required: true }],
                    })
                  }
                  style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)", border: "1px solid var(--sand)", background: "var(--parchment)", padding: "0.375rem 0.75rem", cursor: "pointer" }}
                >
                  + Add field
                </button>
              </div>
            </div>
          </div>

          {/* Rubric editor */}
          <div>
            <span style={labelStyle}>Rubric dimensions (scored /10 each)</span>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {draft.rubricDimensions.map((d, idx) => (
                <div key={idx} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  <input
                    value={d.label}
                    onChange={(e) => setDim(idx, { label: e.target.value })}
                    style={{ ...inputStyle, width: "14rem" }}
                  />
                  <input
                    value={d.description}
                    placeholder="What this dimension asks"
                    onChange={(e) => setDim(idx, { description: e.target.value })}
                    style={{ ...inputStyle, flex: "1 1 18rem" }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Read-only JSON preview */}
          <div>
            <span style={labelStyle}>Schema preview (read-only)</span>
            <pre
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.6875rem",
                border: "1px solid var(--sand)",
                background: "var(--parchment)",
                color: "var(--charcoal)",
                padding: "0.75rem",
                margin: 0,
                overflowX: "auto",
              }}
            >
              {JSON.stringify({ fields: draft.fields }, null, 2)}
            </pre>
          </div>

          {error && (
            <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--ochre)", margin: 0 }}>{error}</p>
          )}

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : draft.id ? "Save changes" : "Create type"}
            </Button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              style={{ ...mono, fontSize: "0.6875rem", border: "1px solid var(--sand)", background: "var(--parchment)", color: "var(--charcoal)", padding: "0.5rem 1rem", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
