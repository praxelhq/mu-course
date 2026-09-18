"use client";
import Link from "next/link";
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
  return (
    <>
      <h2>All workspaces</h2>
      <p>Latest 500 workspaces. Costs below cover the last 24 hours.</p>
      {data.workspaces.map((w) => (
        <Link
          className="st-appeal-row"
          key={w.id}
          href={`/shipyard/reviews?workspace=${w.id}`}
        >
          <div>
            <b>{w.name}</b>
            <p>{w.members.map((m) => m.identity.email).join(", ")}</p>
            <p>
              {[1, 2, 3]
                .map(
                  (cp) =>
                    `${cp}: ${labels[latestSubmission(cp, w.submissions)?.status || ""] || "Not submitted"}`,
                )
                .join(" · ")}
            </p>
          </div>
          <span>
            $
            {(
              data.spend.find((s) => s.workspaceId === w.id)?._sum.costUsd || 0
            ).toFixed(3)}
          </span>
        </Link>
      ))}
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
    </>
  );
}
