import Link from "next/link";
import { getReviewQueue, type ReviewQueueItem } from "@/lib/review-queue";
import { Card, Eyebrow } from "@/components/ui";
import { FinaliseButton, OverrideForm } from "./review-ui";

// Instructor review queue: provisional grades needing human eyes
// (low confidence, policy flags, dynamic top/bottom-5% percentile outliers —
// the percentile membership is computed fresh on every render). Grouped by
// assignment; each group carries its batch-finalise button.

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

// Muted, bordered reason chips (BRAND rule 5): severity from hue only.
const REASON_COLORS: Record<string, string> = {
  "low-confidence": "#8a6a1c", // muted amber
  "percentile-high": "var(--charcoal)",
  "percentile-low": "var(--charcoal)",
};
const FLAG_COLOR = "#8a3b1c"; // muted rust — policy flags

function ReasonChip({ reason }: { reason: string }) {
  const color = REASON_COLORS[reason] ?? FLAG_COLOR;
  return (
    <span
      style={{
        ...mono,
        fontSize: "0.625rem",
        color,
        border: `1px solid ${color}`,
        padding: "0.125rem 0.5rem",
        whiteSpace: "nowrap",
      }}
    >
      {reason}
    </span>
  );
}

function QueueItem({ item }: { item: ReviewQueueItem }) {
  const dims = Object.entries(item.rubricScores).map(([key, v]) => ({ key, ...v }));
  const feedbackPreview =
    item.feedbackMd.length > 260 ? `${item.feedbackMd.slice(0, 260)}…` : item.feedbackMd;
  return (
    <div style={{ borderTop: "1px solid var(--sand)", padding: "1rem 0" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.75rem" }}>
        <span style={{ fontWeight: 600 }}>{item.studentName}</span>
        {item.sectionCode && (
          <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
            Sec {item.sectionCode}
          </span>
        )}
        {item.teamName && (
          <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
            {item.teamName}
          </span>
        )}
        <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>
          {item.typeTitle} · v{item.version}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-geist-mono)", fontSize: "1.125rem", color: "var(--pine)" }}>
          {item.total}
        </span>
        <span style={{ ...mono, fontSize: "0.625rem", color: item.confidence < 0.7 ? "#8a6a1c" : "var(--charcoal)" }}>
          conf {item.confidence.toFixed(2)}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", margin: "0.5rem 0" }}>
        {item.reasons.map((r) => (
          <ReasonChip key={r} reason={r} />
        ))}
      </div>

      <table style={{ borderCollapse: "collapse", margin: "0.5rem 0", width: "100%" }}>
        <tbody>
          {dims.map((d) => (
            <tr key={d.key}>
              <td style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)", padding: "0.25rem 1rem 0.25rem 0", whiteSpace: "nowrap", verticalAlign: "top" }}>
                {d.key} {d.score}
              </td>
              <td style={{ fontSize: "0.8125rem", color: "var(--charcoal)", padding: "0.25rem 0", lineHeight: 1.5 }}>
                {d.rationale}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ margin: "0.5rem 0", fontSize: "0.875rem", color: "var(--charcoal)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {feedbackPreview}
      </p>

      <Link
        href={`/instructor/submissions/${item.submissionId}`}
        style={{ ...mono, fontSize: "0.6875rem", color: "var(--pine)" }}
      >
        Full submission →
      </Link>

      <OverrideForm
        gradeId={item.gradeId}
        dimensions={dims.map((d) => ({ key: d.key, score: d.score, rationale: d.rationale }))}
        feedbackMd={item.feedbackMd}
      />
    </div>
  );
}

export default async function ReviewQueuePage() {
  const queue = await getReviewQueue();

  // Group by assignment, preserving the escalation-first ordering inside
  // each group; groups ordered by their most urgent item.
  const groups = new Map<string, { title: string; items: ReviewQueueItem[] }>();
  for (const item of queue) {
    const g = groups.get(item.assignmentId) ?? { title: item.assignmentTitle, items: [] };
    g.items.push(item);
    groups.set(item.assignmentId, g);
  }

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Instructor</Eyebrow>
      <h1 style={{ fontSize: "2rem", margin: "0 0 0.5rem" }}>Review queue</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 2rem", lineHeight: 1.6 }}>
        Provisional grades needing human eyes: low model confidence, policy flags, and the
        current top/bottom-5% outliers of each assignment (recomputed on every visit).
      </p>

      {queue.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--charcoal)" }}>Queue clear.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "1.5rem" }}>
          {[...groups.entries()].map(([assignmentId, group]) => (
            <Card key={assignmentId}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
                <h2 style={{ fontSize: "1.125rem", margin: 0 }}>{group.title}</h2>
                <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>
                  {group.items.length} to review
                </span>
                <span style={{ marginLeft: "auto" }}>
                  <FinaliseButton assignmentId={assignmentId} assignmentTitle={group.title} />
                </span>
              </div>
              {group.items.map((item) => (
                <QueueItem key={item.gradeId} item={item} />
              ))}
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
