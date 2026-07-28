"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// U16 — client action buttons for the admin costs page: run the portfolio
// crawl, retry a dead-lettered grading job (POST /api/admin/regrade), and
// re-enqueue a blocked screenshot (POST /api/admin/screenshots).

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

function useAction() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [detail, setDetail] = useState("");
  async function run(url: string, body: object) {
    setState("busy");
    setDetail("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setState("err");
        setDetail(json?.error ?? `HTTP ${res.status}`);
        return;
      }
      setState("ok");
      router.refresh();
    } catch {
      setState("err");
      setDetail("network error");
    }
  }
  return { state, detail, run };
}

function ActionButton({
  label,
  busyLabel,
  okLabel,
  onClick,
  state,
  detail,
}: {
  label: string;
  busyLabel: string;
  okLabel: string;
  onClick: () => void;
  state: "idle" | "busy" | "ok" | "err";
  detail: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
      <button
        type="button"
        disabled={state === "busy"}
        onClick={onClick}
        style={{
          ...mono,
          fontSize: "0.625rem",
          color: "var(--pine)",
          border: "1px solid var(--pine)",
          background: "var(--parchment)",
          padding: "0.375rem 0.75rem",
          cursor: state === "busy" ? "default" : "pointer",
          opacity: state === "busy" ? 0.6 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {state === "busy" ? busyLabel : state === "ok" ? okLabel : label}
      </button>
      {state === "err" && (
        <span style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)" }}>{detail}</span>
      )}
    </span>
  );
}

export function RunCrawlButton() {
  const a = useAction();
  return (
    <ActionButton
      label="Run crawl (all students)"
      busyLabel="Enqueuing…"
      okLabel="Crawl enqueued"
      onClick={() => void a.run("/api/admin/crawl", { all: true })}
      state={a.state}
      detail={a.detail}
    />
  );
}

export function RetryGradeButton({ submissionId }: { submissionId: string }) {
  const a = useAction();
  return (
    <ActionButton
      label="Retry"
      busyLabel="Retrying…"
      okLabel="Re-enqueued"
      onClick={() => void a.run("/api/admin/regrade", { submissionId })}
      state={a.state}
      detail={a.detail}
    />
  );
}

export function RetryScreenshotButton({ submissionId }: { submissionId: string }) {
  const a = useAction();
  return (
    <ActionButton
      label="Re-enqueue"
      busyLabel="Enqueuing…"
      okLabel="Enqueued"
      onClick={() => void a.run("/api/admin/screenshots", { submissionId })}
      state={a.state}
      detail={a.detail}
    />
  );
}
