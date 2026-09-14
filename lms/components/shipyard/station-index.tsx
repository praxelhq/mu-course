import type { SpineView } from "@/lib/shipyard/view-models";
import { formatDay, pad2 } from "./format";

// The running map, sticky beside the rail on wide screens. Quiet by design —
// it orients, it does not compete with the station you are standing at.

const STATE_LABEL: Record<string, string> = {
  passed: "Cleared",
  open: "Open now",
  locked: "Locked",
};

export function StationIndex({ spine }: { spine: SpineView }) {
  return (
    <nav className="sy-index" aria-label="Checkpoints">
      <p className="sy-eyebrow sy-index__eyebrow">The six</p>
      <ol className="sy-index__list">
        {spine.checkpoints.map((c) => (
          <li
            key={c.id}
            className={`sy-index__item sy-index__item--${c.state}`}
            aria-current={c.state === "open" ? "step" : undefined}
          >
            <span className="sy-index__n">{pad2(c.order)}</span>
            <span>
              {c.title}
              <span className="sy-index__state">
                {c.state === "passed" && c.passedAt
                  ? `Cleared ${formatDay(c.passedAt)}`
                  : STATE_LABEL[c.state]}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="sy-index__foot">
        A checkpoint opens the moment the one before it clears. Nobody has to flip
        a switch for you.
      </p>
    </nav>
  );
}
