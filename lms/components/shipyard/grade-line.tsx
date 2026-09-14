import type { GradeLineView } from "@/lib/shipyard/view-models";
import { NoGradeYet } from "./empty-states";

// The graduation condition first, because it is a gate and not a weight
// (SPEC §7), then the four components as a compact table. Nothing here is
// final until faculty say so, and the line says that once, at the bottom.

export function GradeLine({
  grade,
  standalone = false,
}: {
  grade: GradeLineView;
  standalone?: boolean;
}) {
  if (!grade) {
    return (
      <section className={standalone ? "sy-grade sy-grade--standalone" : "sy-grade"}>
        <p className="sy-eyebrow">Grade line</p>
        <div style={{ marginTop: "1.5rem" }}>
          <NoGradeYet />
        </div>
      </section>
    );
  }

  return (
    <section className={standalone ? "sy-grade sy-grade--standalone" : "sy-grade"}>
      <p className="sy-eyebrow">Grade line</p>

      <div className="sy-grade__graduation">
        <p className="sy-grade__graduation-q">All six checkpoints cleared</p>
        <span
          className={
            grade.allCheckpointsCleared
              ? "sy-grade__graduation-a sy-grade__graduation-a--yes"
              : "sy-grade__graduation-a"
          }
        >
          {grade.allCheckpointsCleared ? "Yes" : "Not yet"}
        </span>
      </div>

      <table className="sy-table">
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col" className="sy-n">Raw</th>
              <th scope="col" className="sy-n">Weight</th>
              <th scope="col" className="sy-n">Weighted</th>
            </tr>
          </thead>
          <tbody>
            {grade.components.map((c) => (
              <tr key={c.key}>
                <td>
                  <span className="sy-table__label">{c.label}</span>
                  <span className="sy-table__source">{c.source}</span>
                </td>
                <td className={c.raw === null ? "sy-n sy-table__pending" : "sy-n"}>
                  {c.raw === null ? "—" : c.raw}
                </td>
                <td className="sy-n sy-table__pending">{c.weight}</td>
                <td className={c.weighted === null ? "sy-n sy-table__pending" : "sy-n"}>
                  {c.weighted === null ? "—" : c.weighted.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                <span className="sy-eyebrow">Total</span>
              </td>
              <td className="sy-n">
                {grade.total === null ? (
                  <span className="sy-table__pending">Not yet scored</span>
                ) : (
                  <span className="sy-grade__total">{grade.total.toFixed(1)}</span>
                )}
              </td>
            </tr>
        </tfoot>
      </table>

      {grade.provisional && (
        <p className="sy-grade__foot">Provisional until finalised by faculty</p>
      )}
    </section>
  );
}
