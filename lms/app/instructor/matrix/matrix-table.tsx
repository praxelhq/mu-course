"use client";

import { useMemo, useState } from "react";
import { StatusChip } from "@/components/ui";
import type { SectionMatrix } from "@/lib/matrix";

// Client half of the matrix: sticky student column + header row, status and
// assignment filters, CSV export link. Data arrives fully assembled from the
// server (one batched query in lib/matrix) — this component only filters.

const STATUSES = ["blank", "draft", "submitted", "grading", "graded", "finalised"] as const;

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const selectStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-sans)",
  fontSize: "0.875rem",
  border: "1px solid var(--sand)",
  background: "var(--parchment)",
  padding: "0.375rem 0.625rem",
  color: "var(--ink)",
};

export function MatrixTable({ matrix }: { matrix: SectionMatrix }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");

  const assignments = useMemo(
    () =>
      assignmentFilter === "all"
        ? matrix.assignments
        : matrix.assignments.filter((a) => a.id === assignmentFilter),
    [matrix.assignments, assignmentFilter],
  );

  const students = useMemo(() => {
    if (statusFilter === "all") return matrix.students;
    return matrix.students.filter((st) =>
      assignments.some((a) => {
        const cell = st.cells[a.id];
        return statusFilter === "blank" ? !cell : cell?.status === statusFilter;
      }),
    );
  }, [matrix.students, assignments, statusFilter]);

  return (
    <section style={{ border: "1px solid var(--sand)", marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--sand)",
        }}
      >
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="all">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>Assignment</span>
          <select
            value={assignmentFilter}
            onChange={(e) => setAssignmentFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All</option>
            {matrix.assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <span style={{ ...mono, fontSize: "0.625rem", color: "var(--charcoal)" }}>
          {students.length} student{students.length === 1 ? "" : "s"}
        </span>
        <a
          href={`/api/exports/matrix?section=${matrix.sectionCode}`}
          style={{
            ...mono,
            fontSize: "0.625rem",
            marginLeft: "auto",
            color: "var(--cream)",
            background: "var(--pine)",
            border: "1px solid var(--pine)",
            padding: "0.375rem 0.75rem",
            textDecoration: "none",
          }}
        >
          Export CSV
        </a>
      </div>

      <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead>
            <tr>
              <th
                style={{
                  ...mono,
                  fontSize: "0.625rem",
                  color: "var(--clay)",
                  textAlign: "left",
                  padding: "0.625rem 1rem",
                  position: "sticky",
                  top: 0,
                  left: 0,
                  zIndex: 3,
                  background: "var(--parchment)",
                  borderBottom: "1px solid var(--sand)",
                  borderRight: "1px solid var(--sand)",
                  minWidth: "14rem",
                }}
              >
                Student
              </th>
              {assignments.map((a) => (
                <th
                  key={a.id}
                  style={{
                    ...mono,
                    fontSize: "0.5625rem",
                    color: "var(--charcoal)",
                    textAlign: "left",
                    padding: "0.625rem 0.75rem",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    background: "var(--parchment)",
                    borderBottom: "1px solid var(--sand)",
                    minWidth: "9rem",
                    whiteSpace: "nowrap",
                  }}
                  title={a.title}
                >
                  {a.title.length > 26 ? `${a.title.slice(0, 26)}…` : a.title}
                  {a.teamBased && " · team"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((st) => (
              <tr key={st.id}>
                <td
                  style={{
                    padding: "0.5rem 1rem",
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    background: "var(--parchment)",
                    borderBottom: "1px solid var(--sand)",
                    borderRight: "1px solid var(--sand)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--ink)" }}>{st.name}</span>
                  {st.teamName && (
                    <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--clay)", marginLeft: "0.5rem" }}>
                      {st.teamName}
                    </span>
                  )}
                </td>
                {assignments.map((a) => {
                  const cell = st.cells[a.id];
                  return (
                    <td
                      key={a.id}
                      style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--sand)" }}
                    >
                      {cell ? (
                        <span title={`v${cell.version}`}>
                          <StatusChip status={cell.status} />
                        </span>
                      ) : (
                        <span style={{ ...mono, fontSize: "0.625rem", color: "var(--sand)" }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
