import type { CheckpointView, SpineView } from "@/lib/shipyard/view-models";
import { formatBytes, formatDay, formatDayTime } from "./format";

// What the reviewer said, and what to do about it. Three shapes:
//   returned   — the fixes first, the things that already pass kept quiet below
//   in_review  — the queue position and the honest wait
//   passed     — one line
//
// The copy never apologises and never cheers. It states what happened.

export function VerdictPanel({
  checkpoint,
  spine,
}: {
  checkpoint: CheckpointView;
  spine: SpineView;
}) {
  const sub = checkpoint.latestSubmission;
  if (!sub) return null;

  if (sub.status === "in_review" || sub.status === "submitted") {
    return <InReview checkpoint={checkpoint} spine={spine} />;
  }

  const review = sub.review;
  if (!review) return null;

  if (review.verdict === "pass") {
    return (
      <section className="sy-verdict">
        <p className="sy-eyebrow">Cleared</p>
        <p className="sy-verdict__head">
          Passed {formatDay(review.createdAt)} ·{" "}
          {review.pendingHuman || !review.modelUsed ? "human review" : review.modelUsed}
        </p>
      </section>
    );
  }

  return <Returned checkpoint={checkpoint} spine={spine} />;
}

function InReview({ checkpoint, spine }: { checkpoint: CheckpointView; spine: SpineView }) {
  const sub = checkpoint.latestSubmission!;
  const pos = sub.queuePosition;
  return (
    <section className="sy-verdict" aria-live="polite">
      <p className="sy-eyebrow">In review</p>
      <div className="sy-queue">
        {pos !== null && <span className="sy-queue__pos">{pos}</span>}
        <span className="sy-queue__label">
          {pos !== null ? (
            <>
              {pos === 1 ? "next in the queue" : "in the queue"}. {spine.queueNote}
            </>
          ) : (
            spine.queueNote
          )}
        </span>
      </div>
      <div className="sy-indeterminate" aria-hidden="true" />
      {sub.files.length > 0 && (
        <ul className="sy-filelist">
          {sub.files.map((f) => (
            <li className="sy-filelist__item" key={f.key}>
              <span>{f.name}</span>
              <span className="sy-filelist__size">{formatBytes(f.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="sy-verdict__meta">
        <span>
          Attempt <b>{sub.version}</b>
        </span>
        <span>
          Submitted <b>{formatDayTime(sub.submittedAt)}</b>
        </span>
        <span>This page updates itself</span>
      </div>
    </section>
  );
}

function Returned({ checkpoint, spine }: { checkpoint: CheckpointView; spine: SpineView }) {
  const sub = checkpoint.latestSubmission!;
  const review = sub.review!;
  const unmet = review.reasons.filter((r) => !r.met);
  const met = review.reasons.filter((r) => r.met);
  const cooldownMs = sub.nextAllowedResubmitAt
    ? new Date(sub.nextAllowedResubmitAt).getTime() - new Date(spine.now).getTime()
    : 0;

  return (
    <section className="sy-verdict sy-verdict--returned">
      <p className="sy-eyebrow">Returned · attempt {sub.version}</p>
      <h3 className="sy-verdict__head">Fix these, then resubmit.</h3>

      <ul className="sy-reasons">
        {unmet.map((r) => (
          <li className="sy-reason" key={r.criterion}>
            <span className="sy-reason__criterion">{r.criterion}</span>
            <p className="sy-reason__note">{r.note}</p>
          </li>
        ))}
      </ul>

      {met.length > 0 && (
        <>
          <p className="sy-eyebrow sy-met-rule">What already meets the bar</p>
          <ul className="sy-reasons sy-reasons--met">
            {met.map((r) => (
              <li className="sy-reason" key={r.criterion}>
                <span className="sy-reason__criterion">{r.criterion}</span>
                <p className="sy-reason__note">{r.note}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="sy-verdict__meta">
        <span>
          Reviewed <b>{formatDayTime(review.createdAt)}</b>
        </span>
        <span>
          Resubmit window <b>{checkpoint.resubmitWindowHours}h</b>
        </span>
        {/* The live cooldown belongs on the button, not here — the form owns
            it, and saying it twice makes the screen look anxious. */}
        {cooldownMs <= 0 && <span>Resubmit open</span>}
        {review.pendingHuman && <span>With a human reviewer</span>}
      </div>
    </section>
  );
}
