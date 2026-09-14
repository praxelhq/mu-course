import { Markdown } from "@/components/markdown";
import type { CheckpointView, SpineView } from "@/lib/shipyard/view-models";
import { SignalStrip } from "./signal-strip";
import { SubmitForm } from "./submit-form";
import { VerdictPanel } from "./verdict-panel";
import { formatDay, formatGap, pad2, untilDeadline } from "./format";

// One station on the rail. Three shapes, and they do not look like variants of
// one card — a cleared checkpoint is a single line, a locked one is a title you
// can unfold, and the open one is the only bordered, Ochre-marked object on the
// page. That contrast is the whole navigation system.

export function CheckpointCard({
  checkpoint,
  spine,
}: {
  checkpoint: CheckpointView;
  spine: SpineView;
}) {
  return (
    <article className={`sy-cp sy-cp--${checkpoint.state}`}>
      <div className="sy-cp__gutter" aria-hidden="true">
        <span className={`sy-mark sy-mark--${checkpoint.state}`} />
        <span className="sy-cp__order">{pad2(checkpoint.order)}</span>
        <span className="sy-cp__thread" />
      </div>
      <div className="sy-cp__body">
        {checkpoint.state === "passed" ? (
          <Passed checkpoint={checkpoint} />
        ) : checkpoint.state === "locked" ? (
          <Locked checkpoint={checkpoint} />
        ) : (
          <Open checkpoint={checkpoint} spine={spine} />
        )}
      </div>
    </article>
  );
}

function Passed({ checkpoint }: { checkpoint: CheckpointView }) {
  return (
    <div className="sy-cp__row">
      <h2 className="sy-title sy-cp__heading">{checkpoint.title}</h2>
      <span className="sy-cp__cleared">Cleared {formatDay(checkpoint.passedAt)}</span>
    </div>
  );
}

function Locked({ checkpoint }: { checkpoint: CheckpointView }) {
  return (
    <>
      <div className="sy-cp__row">
        <h2 className="sy-title sy-cp__heading">{checkpoint.title}</h2>
        <span className="sy-cp__locked-tag">
          {checkpoint.gateType === "metric" ? "Locked · read live" : "Locked"}
        </span>
      </div>
      <details className="sy-read">
        <summary>Read the bar</summary>
        <div className="sy-read__body">
          <Markdown>{checkpoint.barMarkdown}</Markdown>
        </div>
      </details>
    </>
  );
}

function Open({ checkpoint, spine }: { checkpoint: CheckpointView; spine: SpineView }) {
  const sub = checkpoint.latestSubmission;
  const due = untilDeadline(checkpoint.deadlineAt, spine.now);
  const hasVerdict = Boolean(sub && sub.status !== "draft");
  const pending = sub?.status === "in_review" || sub?.status === "submitted";
  const metricOnly = checkpoint.gateType === "metric";

  const cooldownMs = sub?.nextAllowedResubmitAt
    ? new Date(sub.nextAllowedResubmitAt).getTime() - new Date(spine.now).getTime()
    : 0;

  const bar = (
    <div className="sy-bar">
      <Markdown>{checkpoint.barMarkdown}</Markdown>
    </div>
  );

  return (
    <>
      <div className="sy-cp__eyebrow-row">
        <p className="sy-eyebrow sy-eyebrow--here">
          Open now · Checkpoint {checkpoint.order} of {spine.checkpoints.length}
        </p>
        {/* The date itself lives in the header; the card carries only the
            urgency, and only while it is actually urgent. */}
        {due?.soon && <span className="sy-cp__due sy-cp__due--soon">{due.label}</span>}
      </div>

      <h2 className="sy-title sy-cp__heading">{checkpoint.title}</h2>

      {/* A returned or queued submission is the thing the student came for, so
          it sits above the bar and the bar folds away behind one line. With
          nothing submitted yet, the bar is the point and shows in full. */}
      {hasVerdict ? (
        <>
          <VerdictPanel checkpoint={checkpoint} spine={spine} />
          {metricOnly && <SignalStrip checkpoint={checkpoint} product={spine.product} />}
          <details className="sy-read">
            <summary>Read the bar again</summary>
            <div className="sy-read__body">
              <Markdown>{checkpoint.barMarkdown}</Markdown>
            </div>
          </details>
        </>
      ) : (
        <>
          {metricOnly && <SignalStrip checkpoint={checkpoint} product={spine.product} />}
          {bar}
        </>
      )}

      {!metricOnly && checkpoint.signals && (
        <SignalStrip checkpoint={checkpoint} product={spine.product} />
      )}

      {checkpoint.fields.length > 0 && !pending && (
        <SubmitForm
          checkpointKey={checkpoint.key}
          fields={checkpoint.fields}
          resubmit={checkpoint.attempts > 0}
          cooldownUntil={cooldownMs > 0 ? sub!.nextAllowedResubmitAt : null}
          cooldownLabel={cooldownMs > 0 ? formatGap(cooldownMs) : ""}
        />
      )}

      {metricOnly && (
        <p className="sy-grade__foot" style={{ marginTop: "1.5rem" }}>
          Nothing to submit · this opens the moment the tracker agrees
        </p>
      )}
    </>
  );
}
