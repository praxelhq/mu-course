import type { SpineView } from "@/lib/shipyard/view-models";
import { pad2, untilDeadline } from "./format";

// Where am I, in one glance: the product, the count cleared as a big honest
// numeral, six ticks, and the deadline of the station I am standing at.

export function SpineHeader({ spine }: { spine: SpineView }) {
  const cleared = spine.checkpoints.filter((c) => c.state === "passed").length;
  const total = spine.checkpoints.length;
  const current = spine.checkpoints.find((c) => c.order === spine.currentOrder);
  const due =
    current && current.state === "open" ? untilDeadline(current.deadlineAt, spine.now) : null;

  return (
    <header className="sy-header">
      <div>
        <p className="sy-eyebrow">One product · six checkpoints</p>
        {spine.product ? (
          <>
            <h1 className="sy-display sy-header__name">{spine.product.name}</h1>
            <p className="sy-header__line">{spine.product.oneLiner}</p>
            {spine.product.liveUrl && (
              <a
                className="sy-header__url"
                href={spine.product.liveUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                {spine.product.liveUrl.replace(/^https?:\/\//, "")}
              </a>
            )}
          </>
        ) : (
          <>
            <h1 className="sy-display sy-header__name sy-header__name--unset">
              Your product
            </h1>
            <p className="sy-header__line">
              It gets its name at checkpoint 1, below, along with the sentence that
              says who it is for.
            </p>
          </>
        )}
      </div>

      <div className="sy-progress">
        <p className="sy-eyebrow">Checkpoints cleared</p>
        <p className="sy-progress__count">
          <span className="sy-progress__cleared">{pad2(cleared)}</span>
          <span className="sy-progress__of">/{pad2(total)}</span>
        </p>
        <div className="sy-progress__ticks" aria-hidden="true">
          {spine.checkpoints.map((c) => (
            <span
              key={c.id}
              className={
                c.state === "passed"
                  ? "sy-progress__tick sy-progress__tick--done"
                  : c.state === "open"
                    ? "sy-progress__tick sy-progress__tick--here"
                    : "sy-progress__tick"
              }
            />
          ))}
        </div>
        {due && current && (
          <p className="sy-eyebrow sy-header__due">
            {current.title} · <b>{due.label}</b>
          </p>
        )}
      </div>
    </header>
  );
}
