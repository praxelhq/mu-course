import Link from "next/link";
import { loadReviewQueue } from "@/lib/shipyard/instructor";
import { formatDayTime } from "@/components/shipyard/format";
import { EmptyState } from "@/components/shipyard/empty-states";

export const dynamic = "force-dynamic";

// The human review queue (SPEC §4): every review that is waiting on a person —
// low confidence, an outlier, or a return a student disputed — newest first.
//
// M1 lists them and links to the file where the verdict can be recorded. The
// one-click resolve, which also stamps `humanResolvedAt` so the row leaves this
// list, arrives with the real reviewer in M2.

export default async function ShipyardQueuePage() {
  const queue = await loadReviewQueue();

  return (
    <main className="sy-main">
      <header className="sy-shead">
        <div>
          <p className="sy-eyebrow">Course 2 · faculty</p>
          <h1 className="sy-display sy-shead__title">Review queue</h1>
          <p className="sy-shead__line">
            {queue.length === 0
              ? "Nothing is waiting on a person."
              : `${queue.length} ${queue.length === 1 ? "review is" : "reviews are"} waiting on a person. A pass below the confidence bar does not count until one of you agrees with it.`}
          </p>
        </div>
      </header>

      {queue.length === 0 ? (
        <EmptyState head="The queue is empty">
          Reviews land here when the reviewer is unsure of itself, when a
          submission contradicts what the render shows, or when a student disputes
          a return. Nothing here means nothing is stuck.
        </EmptyState>
      ) : (
        <div className="sy-matrix-scroll">
          <table className="sy-list">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Checkpoint</th>
                <th scope="col">Verdict</th>
                <th scope="col" className="sy-n">
                  Confidence
                </th>
                <th scope="col">Model</th>
                <th scope="col">Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((entry) => (
                <tr key={entry.reviewId}>
                  <th scope="row">
                    <Link href={`/shipyard/instructor/students/${entry.userId}`}>
                      {entry.studentName}
                    </Link>
                    <span className="sy-list__sub">
                      {entry.sectionCode ?? "—"} · {entry.productName || "unnamed"}
                    </span>
                  </th>
                  <td>
                    {entry.checkpointOrder}. {entry.checkpointTitle}
                  </td>
                  <td>
                    <span className={`sy-pill sy-pill--${entry.verdict}`}>{entry.verdict}</span>
                  </td>
                  <td className="sy-n sy-mono">{entry.confidence.toFixed(2)}</td>
                  <td className="sy-mono">{entry.modelUsed}</td>
                  <td>{formatDayTime(entry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
