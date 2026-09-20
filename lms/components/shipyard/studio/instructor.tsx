"use client";
import Link from "next/link";
import { useState } from "react";
import type { InstructorState } from "@/lib/shipyard/studio/instructor";
import { latestSubmission } from "@/lib/shipyard/studio/contracts";
import { labels } from "./shared";

export function InstructorOverview({
  data,
  busy,
  act,
}: {
  data: InstructorState;
  busy: boolean;
  act: (body: unknown) => unknown;
}) {
  const [query, setQuery] = useState("");
  const workspaces = data.workspaces.filter((w) => {
    const fields = (
      latestSubmission(1, w.submissions)?.snapshot as
        { fields?: { title?: string; description?: string } } | undefined
    )?.fields;
    return [
      w.name,
      fields?.title,
      fields?.description,
      ...w.members.map((m) => m.identity.email),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  return (
    <>
      <div className="st-ledger-header">
        <h2>Student submissions</h2>
        <a className="st-button secondary" href="/api/shipyard/studio?export=1">
          Download all submissions · CSV ↓
        </a>
      </div>
      <p>
        Latest 500 workspaces. Open a project to inspect submitted work,
        designs, feedback and earlier versions. The CSV includes all submitted
        versions and can be imported into Google Sheets.
      </p>
      <label className="st-ledger-search">
        Find a team, student or idea
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search submissions…"
        />
      </label>
      <div className="st-ledger-scroll">
        <table className="st-ledger">
          <thead>
            <tr>
              <th>Team / students</th>
              <th>Submitted idea</th>
              <th>Idea</th>
              <th>Product spec</th>
              <th>Product</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((w) => {
              const idea = (
                latestSubmission(1, w.submissions)?.snapshot as
                  | { fields?: { title?: string; description?: string } }
                  | undefined
              )?.fields;
              return (
                <tr key={w.id}>
                  <td>
                    <Link href={`/shipyard/reviews?workspace=${w.id}`}>
                      {w.name} ↗
                    </Link>
                    <small>
                      {w.members.map((m) => m.identity.email).join(", ")}
                    </small>
                  </td>
                  <td>
                    <b>{idea?.title || "No idea submitted yet"}</b>
                    {idea?.description && (
                      <details>
                        <summary>Read idea</summary>
                        <p>{idea.description}</p>
                      </details>
                    )}
                  </td>
                  {[1, 2, 3].map((cp) => (
                    <td key={cp}>
                      {labels[
                        latestSubmission(cp, w.submissions)?.status || ""
                      ] || "Not submitted"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!workspaces.length && <p>No matching workspaces.</p>}
      </div>
      <details className="st-operations">
        <summary>Source availability, costs and job health</summary>
        <p>
          Total AI and research cost in the last 24 hours: $
          {data.spend
            .reduce((sum, row) => sum + (row._sum.costUsd || 0), 0)
            .toFixed(3)}
        </p>
        <h2>Evidence sources</h2>
        {data.switches.map((s) => (
          <div className="st-member" key={s.source}>
            <span>
              {s.source} · {s.enabled ? "Available" : "Paused"}
            </span>
            <button
              disabled={busy}
              onClick={() =>
                act({
                  action: "source-setting",
                  source: s.source,
                  enabled: !s.enabled,
                })
              }
            >
              {s.enabled ? "Pause" : "Enable"} source
            </button>
          </div>
        ))}
        {data.knowledge.map((k) => (
          <p key={k.source}>
            {k.source}: {k._count.toLocaleString()} records · latest captured{" "}
            {k._max.capturedAt
              ? new Date(k._max.capturedAt).toLocaleDateString("en-IN")
              : "unknown"}{" "}
            · last imported{" "}
            {k._max.updatedAt
              ? new Date(k._max.updatedAt).toLocaleDateString("en-IN")
              : "unknown"}
          </p>
        ))}
        <h2>Jobs that need attention</h2>
        {!data.failures.length && <p>No failed jobs.</p>}
        {data.failures.map((j) => (
          <Link
            className="st-appeal-row"
            key={j.id}
            href={`/shipyard/reviews?workspace=${j.workspaceId}`}
          >
            <div>
              <b>
                {j.workspace.name} · {j.kind}
              </b>
              <p>{j.error}</p>
            </div>
          </Link>
        ))}
      </details>
    </>
  );
}
