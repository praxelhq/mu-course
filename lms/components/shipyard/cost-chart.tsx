import type { CostBucket } from "@/lib/shipyard/review-costs";

// Fourteen days of model spend, drawn as one line.
//
// Inline SVG and no library, for three reasons that all point the same way:
// it is a single series of fourteen numbers, the admin bench is a server
// component and a chart library would make it a client one, and the page
// already has a type system, a palette and a grid that a library would
// re-import with different opinions. The grid is recessive, the axis labels
// are Plex Mono like every other figure in this portal, and the only coloured
// thing is the line itself — one accent per view (docs/BRAND.md).
//
// No legend: with one series the title names it (dataviz skill). The per-point
// `<title>` is the hover layer a static SVG can honestly offer.

const W = 1000;
const H = 210;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;

/** Spend here is cents-scale; two decimals would draw a flat line at zero. */
export function formatUsd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
}

/** "2026-09-15" → "15 Sep", without dragging Intl through a chart. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDay(label: string): string {
  const [, m, d] = label.split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${Number(d)} ${month}` : label;
}

export function CostChart({ days }: { days: CostBucket[] }) {
  if (days.length === 0) return null;

  const max = Math.max(...days.map((d) => d.costUsd));
  // A flat-zero fortnight still gets a real axis rather than a division by nil.
  const top = max > 0 ? max * 1.15 : 1;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (days.length === 1 ? innerW / 2 : (i * innerW) / (days.length - 1));
  const y = (v: number) => PAD_T + innerH - (v / top) * innerH;

  const path = days.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(d.costUsd).toFixed(1)}`).join(" ");
  const area = `${path} L${x(days.length - 1).toFixed(1)} ${PAD_T + innerH} L${x(0).toFixed(1)} ${PAD_T + innerH} Z`;

  const gridlines = [0, 0.5, 1];
  const last = days[days.length - 1];
  const total = days.reduce((s, d) => s + d.costUsd, 0);

  return (
    <figure className="sy-chart">
      <figcaption className="sy-chart__cap">
        <span className="sy-eyebrow">Spend per day · last {days.length} days</span>
        <span className="sy-mono sy-chart__total">{formatUsd(total)} in the window</span>
      </figcaption>

      <svg
        className="sy-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Model spend per day for the last ${days.length} days, ${formatUsd(total)} in total.`}
      >
        {gridlines.map((f) => (
          <g key={f}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(top * f)}
              y2={y(top * f)}
              className="sy-chart__grid"
            />
            <text x={PAD_L - 8} y={y(top * f) + 4} className="sy-chart__ylab" textAnchor="end">
              {formatUsd(Math.round(top * f * 10000) / 10000)}
            </text>
          </g>
        ))}

        <path d={area} className="sy-chart__area" />
        <path d={path} className="sy-chart__line" />

        {days.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.costUsd)} r={i === days.length - 1 ? 5 : 3} className="sy-chart__dot" />
            {/* The hit target is wider than the mark, so a hover finds a day. */}
            <rect
              x={x(i) - innerW / (days.length * 2)}
              y={PAD_T}
              width={innerW / days.length}
              height={innerH}
              fill="transparent"
            >
              <title>{`${shortDay(d.label)} · ${formatUsd(d.costUsd)} · ${d.calls} calls`}</title>
            </rect>
          </g>
        ))}

        <text x={PAD_L} y={H - 8} className="sy-chart__xlab" textAnchor="start">
          {shortDay(days[0].label)}
        </text>
        <text x={W - PAD_R} y={H - 8} className="sy-chart__xlab" textAnchor="end">
          {shortDay(last.label)}
        </text>
      </svg>
    </figure>
  );
}
