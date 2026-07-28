"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// U15 — client form: number inputs per teammate with a LIVE running total that
// must equal exactly 100 to enable submit, plus three 1–5 ratings each.

export type TeammateRow = {
  id: string;
  name: string;
  points: number | null;
  reliability: number | null;
  communication: number | null;
  helpfulness: number | null;
};

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const RATING_KEYS = ["reliability", "communication", "helpfulness"] as const;
type RatingKey = (typeof RATING_KEYS)[number];

type RowState = {
  points: string;
  reliability: number | null;
  communication: number | null;
  helpfulness: number | null;
};

export function PeerReviewForm({
  teamName,
  checkpoint,
  teammates,
  alreadySubmitted,
}: {
  teamName: string;
  checkpoint: number;
  teammates: TeammateRow[];
  alreadySubmitted: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      teammates.map((t) => [
        t.id,
        {
          points: t.points === null ? "" : String(t.points),
          reliability: t.reliability,
          communication: t.communication,
          helpfulness: t.helpfulness,
        },
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const total = useMemo(
    () =>
      teammates.reduce((sum, t) => {
        const n = Number.parseInt(rows[t.id]?.points ?? "", 10);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [rows, teammates],
  );

  const pointsValid = teammates.every((t) => {
    const raw = rows[t.id]?.points ?? "";
    const n = Number.parseInt(raw, 10);
    return raw !== "" && Number.isInteger(n) && n >= 0 && n <= 100;
  });
  const ratingsValid = teammates.every((t) =>
    RATING_KEYS.every((k) => rows[t.id]?.[k] !== null),
  );
  const canSubmit = pointsValid && ratingsValid && total === 100 && !busy;

  const setPoints = (id: string, value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], points: value } }));
  const setRating = (id: string, key: RatingKey, value: number) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/peer-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          allocations: teammates.map((t) => ({
            revieweeId: t.id,
            points: Number.parseInt(rows[t.id].points, 10),
            ratings: {
              reliability: rows[t.id].reliability,
              communication: rows[t.id].communication,
              helpfulness: rows[t.id].helpfulness,
            },
          })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(body.error ?? `Submission failed (${res.status}).`);
        setSaved(false);
      } else {
        setMessage(
          `Checkpoint ${checkpoint} saved. You can revise it any time while the checkpoint stays open.`,
        );
        setSaved(true);
        router.refresh();
      }
    } catch {
      setMessage("Network error — nothing was saved. Try again.");
      setSaved(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid var(--sand)", background: "var(--parchment)", padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.125rem", margin: 0 }}>{teamName}</h2>
        {alreadySubmitted ? (
          <span style={{ ...mono, fontSize: "0.625rem", color: "var(--pine)", border: "1px solid var(--pine)", padding: "0.125rem 0.5rem" }}>
            Submitted — editing overwrites
          </span>
        ) : null}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Teammate", "Points", "Reliability", "Communication", "Helpfulness"].map((h) => (
                <th
                  key={h}
                  style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", textAlign: "left", padding: "0.5rem 0.75rem 0.5rem 0", borderBottom: "1px solid var(--sand)", fontWeight: 400 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teammates.map((t) => (
              <tr key={t.id}>
                <td style={{ padding: "0.625rem 0.75rem 0.625rem 0", borderBottom: "1px solid var(--sand)", fontWeight: 500 }}>
                  {t.name}
                </td>
                <td style={{ padding: "0.625rem 0.75rem 0.625rem 0", borderBottom: "1px solid var(--sand)" }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={rows[t.id].points}
                    onChange={(e) => setPoints(t.id, e.target.value)}
                    aria-label={`Points for ${t.name}`}
                    style={{ width: "4.5rem", padding: "0.375rem 0.5rem", border: "1px solid var(--sand)", background: "#fff", fontFamily: "var(--font-geist-mono)" }}
                  />
                </td>
                {RATING_KEYS.map((key) => (
                  <td key={key} style={{ padding: "0.625rem 0.75rem 0.625rem 0", borderBottom: "1px solid var(--sand)" }}>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {[1, 2, 3, 4, 5].map((v) => {
                        const active = rows[t.id][key] === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setRating(t.id, key, v)}
                            aria-label={`${key} ${v} for ${t.name}`}
                            style={{
                              width: "1.75rem",
                              height: "1.75rem",
                              border: `1px solid ${active ? "var(--pine)" : "var(--sand)"}`,
                              background: active ? "var(--pine)" : "#fff",
                              color: active ? "#fff" : "var(--charcoal)",
                              fontFamily: "var(--font-geist-mono)",
                              fontSize: "0.75rem",
                              cursor: "pointer",
                            }}
                          >
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", gap: "1rem", flexWrap: "wrap" }}>
        <p style={{ margin: 0 }}>
          <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", marginRight: "0.5rem" }}>
            Running total
          </span>
          <span
            style={{
              fontFamily: "var(--font-fraunces)",
              fontWeight: 700,
              fontSize: "1.5rem",
              color: total === 100 ? "var(--pine)" : "#8a2a1c",
            }}
          >
            {total}
          </span>
          <span style={{ color: "var(--clay)" }}> / 100</span>
          {total !== 100 ? (
            <span style={{ marginLeft: "0.75rem", color: "#8a2a1c", fontSize: "0.8125rem" }}>
              {total > 100 ? `Remove ${total - 100} point${total - 100 === 1 ? "" : "s"}.` : `Allocate ${100 - total} more point${100 - total === 1 ? "" : "s"}.`}
            </span>
          ) : !ratingsValid ? (
            <span style={{ marginLeft: "0.75rem", color: "var(--clay)", fontSize: "0.8125rem" }}>
              Rate every teammate on all three scales.
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            padding: "0.625rem 1.5rem",
            border: "1px solid var(--pine)",
            background: canSubmit ? "var(--pine)" : "var(--parchment)",
            color: canSubmit ? "#fff" : "var(--clay)",
            fontFamily: "var(--font-geist-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: "0.75rem",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {busy ? "Saving…" : alreadySubmitted ? "Overwrite submission" : "Submit checkpoint"}
        </button>
      </div>

      {message ? (
        <p style={{ marginTop: "0.75rem", marginBottom: 0, color: saved ? "var(--pine)" : "#8a2a1c", fontSize: "0.875rem" }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
