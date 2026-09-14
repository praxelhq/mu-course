import Link from "next/link";
import type { MatrixCell, SectionMatrix } from "@/lib/shipyard/instructor";
import { pad2 } from "./format";

// 60 students by six checkpoints, 360 squares, read at a glance.
//
// The square carries the state and nothing else — no text, no icon, no count —
// because the only thing a grid this dense can say legibly is "where is the
// colour". Everything specific is one click away in the drill-down, and the
// row header is that link.
//
// Five shapes, deliberately not five hues of one colour:
//   locked   a hairline outline, so the row still reads as six positions
//   open     white inside a findable border: somebody could be working here
//   returned a soft red fill — the one thing an instructor looks for
//   review   mint with a dot: the machine has it, nobody needs to act
//   passed   solid primary
//
// The whole grid scrolls horizontally inside its own container, so a phone
// shows the names column and pans across the six rather than reflowing.

const CELL_LABEL: Record<string, string> = {
  locked: "locked",
  open: "open",
  returned: "returned, waiting on the student",
  review: "in review",
  passed: "cleared",
};

function cellKindOf(cell: MatrixCell): keyof typeof CELL_LABEL {
  if (cell.state === "passed") return "passed";
  if (cell.state === "locked") return "locked";
  if (cell.inReview) return "review";
  if (cell.returned) return "returned";
  return "open";
}

export function MatrixGrid({ matrix }: { matrix: SectionMatrix }) {
  if (matrix.rows.length === 0) {
    return (
      <div className="sy-empty">
        <h2 className="sy-empty__head">No students in this section</h2>
        <p className="sy-empty__body">
          The roster has nobody in section {matrix.section.code} yet. Import a roster
          row and they appear here on their next page load.
        </p>
      </div>
    );
  }

  return (
    <div className="sy-matrix-scroll">
      <table className="sy-matrix">
        <caption className="sy-visually-hidden">
          Section {matrix.section.code}: every student against the six checkpoints.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sy-matrix__corner">
              <span className="sy-eyebrow">Student</span>
            </th>
            {matrix.checkpoints.map((cp) => {
              const count = matrix.counts.find((c) => c.checkpointId === cp.id);
              return (
                <th scope="col" key={cp.id} className="sy-matrix__head">
                  <span className="sy-matrix__n">{pad2(cp.order)}</span>
                  <span className="sy-matrix__title">{cp.title}</span>
                  {/* Four numbers in the legend's own order and colours:
                      cleared, open, returned, in review. */}
                  <span
                    className="sy-matrix__counts"
                    title={`${count?.passed ?? 0} cleared · ${count?.open ?? 0} open · ${count?.returned ?? 0} returned · ${count?.inReview ?? 0} in review`}
                  >
                    <span className="sy-matrix__count sy-matrix__count--passed">
                      {count?.passed ?? 0}
                    </span>
                    <span className="sy-matrix__count">{count?.open ?? 0}</span>
                    <span className="sy-matrix__count sy-matrix__count--returned">
                      {count?.returned ?? 0}
                    </span>
                    <span className="sy-matrix__count sy-matrix__count--review">
                      {count?.inReview ?? 0}
                    </span>
                    <span className="sy-visually-hidden">
                      {count?.passed ?? 0} cleared, {count?.open ?? 0} open,{" "}
                      {count?.returned ?? 0} returned, {count?.inReview ?? 0} in review
                    </span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.userId}>
              <th scope="row" className="sy-matrix__name">
                <Link href={`/shipyard/instructor/students/${row.userId}`}>{row.name}</Link>
                <span className="sy-matrix__product">{row.productName || "—"}</span>
              </th>
              {matrix.checkpoints.map((cp) => {
                const cell = row.cells.find((c) => c.checkpointId === cp.id);
                const kind = cell ? cellKindOf(cell) : "locked";
                return (
                  <td key={cp.id} className="sy-matrix__cell">
                    <span
                      className={`sy-sq sy-sq--${kind}${cell?.manuallyOpened ? " sy-sq--manual" : ""}`}
                      title={`${row.name} · ${cp.title} · ${CELL_LABEL[kind]}`}
                    >
                      <span className="sy-visually-hidden">
                        {cp.title}: {CELL_LABEL[kind]}
                        {cell && cell.attempts > 0 ? `, ${cell.attempts} attempts` : ""}
                      </span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatrixLegend() {
  return (
    <ul className="sy-legend" aria-label="What the squares mean">
      {(["passed", "open", "returned", "review", "locked"] as const).map((kind) => (
        <li className="sy-legend__item" key={kind}>
          <span className={`sy-sq sy-sq--${kind}`} aria-hidden="true" />
          {CELL_LABEL[kind]}
        </li>
      ))}
    </ul>
  );
}
