import type { CheckpointView } from "@/lib/shipyard/view-models";
import { formatTime } from "./format";

// What the tracker sees, in the tracker's own words. Nothing a student types
// ever appears here (SPEC §5) — that is the whole point of showing it.

export function SignalStrip({ checkpoint }: { checkpoint: CheckpointView }) {
  const signals = checkpoint.signals;
  if (!signals || signals.length === 0) return null;

  return (
    <section className="sy-signals" aria-label="Live signals from Shipped.money">
      <p className="sy-eyebrow">
        {checkpoint.gateType === "metric"
          ? "This gate is read, not reviewed"
          : "Read live · the other half of this gate"}
      </p>
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
      <p className="sy-signals__note">
        Read from Shipped.money · Verified data only
        {checkpoint.signalsRefreshedAt
          ? ` · refreshed ${formatTime(checkpoint.signalsRefreshedAt)}`
          : ""}
      </p>
    </section>
  );
}
