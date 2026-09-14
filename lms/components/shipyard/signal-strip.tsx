import type { CheckpointView, SpineView } from "@/lib/shipyard/view-models";
import { formatTime } from "./format";
import { ConnectTrackerForm } from "./connect-tracker-form";
import { trackerProjectUrl } from "./tracker-url";

// What the tracker sees, in the tracker's own words. Nothing a student types
// ever appears here (SPEC §5) — that is the whole point of showing it.
//
// One exception, and it is not a signal: the connection itself. An unconnected
// product reads as five blank signals with no explanation, so the strip carries
// the fix — paste your project link — and, once connected, the slug as a chip
// that links to the project so a student can check the number at the source.

export function SignalStrip({
  checkpoint,
  product,
}: {
  checkpoint: CheckpointView;
  /** Null before the student's first page load creates one. */
  product?: SpineView["product"];
}) {
  const signals = checkpoint.signals;
  if (!signals || signals.length === 0) return null;

  const connected = product?.trackerProductId ?? null;
  const showConnect = product !== undefined && connected === null;

  return (
    <section className="sy-signals" aria-label="Live signals from Shipped.money">
      <div className="sy-signals__head">
        <p className="sy-eyebrow">
          {checkpoint.gateType === "metric"
            ? "This gate is read, not reviewed"
            : "Read live · the other half of this gate"}
        </p>
        {connected && (
          <a
            className="sy-chip sy-chip--mono"
            href={trackerProjectUrl(connected)}
            target="_blank"
            rel="noreferrer noopener"
          >
            {connected}
          </a>
        )}
      </div>

      <div className="sy-signals__grid">
        {signals.map((s) => (
          <div
            key={s.name}
            className={
              s.met === true
                ? "sy-signal sy-signal--met"
                : s.met === false
                  ? "sy-signal sy-signal--unmet"
                  : "sy-signal sy-signal--unknown"
            }
          >
            <span className="sy-signal__label">{s.label}</span>
            <span className="sy-signal__value">
              <span className="sy-signal__mark" aria-hidden="true" />
              {s.value}
              <span className="sy-visually-hidden">
                {s.met === true ? " — met" : s.met === false ? " — not met" : " — not measured"}
              </span>
            </span>
          </div>
        ))}
      </div>

      {showConnect && <ConnectTrackerForm />}

      <p className="sy-signals__note">
        Read from Shipped.money · Verified data only
        {checkpoint.signalsRefreshedAt
          ? ` · refreshed ${formatTime(checkpoint.signalsRefreshedAt)}`
          : ""}
      </p>
    </section>
  );
}
