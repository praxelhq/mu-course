import Link from "next/link";
import { listSections } from "@/lib/shipyard/instructor";
import { loadReviewQueue, type QueueEntry } from "@/lib/shipyard/review-escalate";
import { formatDayTime } from "@/components/shipyard/format";
import { EmptyState } from "@/components/shipyard/empty-states";
import { ReviewActions } from "@/components/shipyard/review-actions";

export const dynamic = "force-dynamic";

// The human review queue (SPEC §4): every review that is waiting on a person —
// a pass the trust rules held, a low-confidence return, a contradiction, or a
// return a student disputed — newest first.
//
// It is a list of cases rather than a table of rows. A row could carry the
// student, the checkpoint and the verdict, but not the four things that decide
// what to do about it: why it was flagged, what the student was told, what the
// student said back, and what a second model thought. Those are paragraphs,
// and paragraphs do not go in cells.
//
// The queue reads `loadReviewQueue` directly rather than fetching its own
// route: the route is for the poll and for anything outside this app, and a
// server component fetching its own server is a round trip that can fail.

const REASON_WORDS: Record<string, string> = {
  low_confidence: "the reviewer was unsure",
  "low-confidence": "the reviewer was unsure",
  contradiction: "the write-up and the render disagree",
  outlier: "an outlier score",
  disputed: "the student disputed it",
  dispute: "the student disputed it",
  spam: "flagged as spam",
  blank: "flagged as blank",
  near_duplicate: "looks like a near-duplicate",
  unsafe_content: "flagged content",
  needs_human: "the reviewer asked for a person",
  not_model_reviewed: "no model judged it",
};

export default async function ShipyardQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.section) ? params.section[0] : params.section;

  const sections = await listSections();
  const active = raw ? (sections.find((s) => s.code === raw) ?? null) : null;
  const queue = await loadReviewQueue({ sectionId: active?.id ?? null });

  const held = queue.filter((e) => e.heldPass).length;
  const disputed = queue.filter((e) => e.disputed).length;

  return (
    <main className="sy-main">
      <header className="sy-shead">
        <div>
          <p className="sy-eyebrow">Course 2 · faculty</p>
          <h1 className="sy-display sy-shead__title">Waiting on a person</h1>
          <p className="sy-shead__line">
            {queue.length === 0 ? (
              "Nothing is stuck."
            ) : (
              <>
                <b>{queue.length}</b> {queue.length === 1 ? "review" : "reviews"}
                {held > 0 && <> · {held} held below the confidence bar</>}
                {disputed > 0 && <> · {disputed} disputed</>}
              </>
            )}
          </p>
        </div>
      </header>

      <nav className="sy-tabs" aria-label="Sections">
        <Link
          href="/shipyard/instructor/queue"
          className={active === null ? "sy-tab sy-tab--current" : "sy-tab"}
          aria-current={active === null ? "page" : undefined}
        >
          All
        </Link>
        {sections.map((s) => (
          <Link
            key={s.id}
            href={`/shipyard/instructor/queue?section=${s.code}`}
            className={s.id === active?.id ? "sy-tab sy-tab--current" : "sy-tab"}
            aria-current={s.id === active?.id ? "page" : undefined}
          >
            {s.code}
          </Link>
        ))}
      </nav>

      {queue.length === 0 ? (
        <EmptyState head="Nothing waiting on a human.">
          Reviews land here when the reviewer is unsure of itself, when a
          submission contradicts what the render shows, or when a student disputes
          a return. A pass below the confidence bar does not count until one of
          you agrees with it.
        </EmptyState>
      ) : (
        <div className="sy-queue-list">
          {queue.map((entry) => (
            <QueueCase key={entry.reviewId} entry={entry} />
          ))}
        </div>
      )}
    </main>
  );
}

function QueueCase({ entry }: { entry: QueueEntry }) {
  return (
    <article className={entry.heldPass ? "sy-case sy-case--held" : "sy-case"}>
      {/* The student's name leads, because it is the thing that differs from
          row to row — a queue of fourteen returns on checkpoint 1 that opens
          with "1 · The idea, with demand" fourteen times is a queue nobody can
          scan. */}
      <header className="sy-case__head">
        <h2 className="sy-title sy-case__who">
          <Link href={`/shipyard/instructor/students/${entry.student.id}`}>
            {entry.student.name ?? entry.student.email}
          </Link>
          <span className="sy-case__sub">
            {entry.student.sectionCode ?? "—"} · {entry.product.name || "unnamed"} ·{" "}
            <span className="sy-mono">{entry.checkpoint.order}</span> {entry.checkpoint.title} ·
            attempt {entry.attempt}
          </span>
        </h2>

        <span className="sy-case__marks">
          {entry.heldPass ? (
            <span className="sy-mark-held">Passed, gate held</span>
          ) : (
            <span className={`sy-pill sy-pill--${entry.verdict}`}>{entry.verdict}</span>
          )}
          {entry.disputed && <span className="sy-pill sy-pill--needs-human">disputed</span>}
        </span>
      </header>

      <p className="sy-case__meta">
        <span className="sy-mono">confidence {entry.confidence.toFixed(2)}</span>
        <span className="sy-mono">{entry.modelUsed}</span>
        <span>{formatDayTime(entry.createdAt)}</span>
      </p>

      {entry.needsHumanReasons.length > 0 && (
        <p className="sy-case__why">
          <span className="sy-eyebrow">Here because</span>{" "}
          {entry.needsHumanReasons.map((r) => REASON_WORDS[r] ?? r.replace(/_/g, " ")).join(" · ")}
        </p>
      )}

      {entry.summaryForStudent && (
        <blockquote className="sy-case__quote">{entry.summaryForStudent}</blockquote>
      )}

      {entry.disputed && (
        <div className="sy-case__block">
          <p className="sy-eyebrow">The student&rsquo;s note</p>
          <p className="sy-case__note">{entry.disputed.note}</p>
        </div>
      )}

      {entry.escalation && (
        <div className="sy-case__block">
          <p className="sy-eyebrow">
            Second opinion ·{" "}
            {entry.escalation.agreesWithFirstVerdict ? "agrees" : "disagrees"} · says{" "}
            {entry.escalation.verdict}
          </p>
          <p className="sy-case__note">{entry.escalation.humanNote}</p>
          <p className="sy-mono sy-case__model">{entry.escalation.modelUsed}</p>
        </div>
      )}

      <ReviewActions reviewId={entry.reviewId} verdict={entry.verdict} />
    </article>
  );
}
