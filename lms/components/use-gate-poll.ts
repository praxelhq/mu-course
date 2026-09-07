"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Live gate propagation (short-poll, see docs/DECISIONS.md): poll the
// /api/gates/state snapshot every 4s and expose { gates, version }. The
// version is a server-side content hash — the `ifVersion` param lets
// unchanged polls answer with a tiny { unchanged: true } body.
//
// Server-component pages (session hubs) get their fresh gate state via
// router.refresh() on version change — the hook triggers it by default, so a
// hub only needs to mount the hook and render from server data. Pass
// refreshOnChange: false when the caller consumes `gates` directly (the
// Unlock Console grid does its own merging).
//
// Polling pauses while the tab is hidden (visibilitychange) and fires
// immediately on return, so a student flipping back to the tab sees the
// current state at once. Worst-case student-visible latency stays under ~5s.

export type PolledGate = {
  targetType: "session" | "material" | "assignment" | "quiz" | "app_review";
  targetId: string;
  sectionId: string;
  state: "locked" | "open" | "closed";
};

export function useGatePoll(options?: {
  /** Section to watch. Omit as instructor/admin to watch all sections. */
  sectionId?: string;
  intervalMs?: number;
  /** router.refresh() when the version changes (default true). */
  refreshOnChange?: boolean;
}): { gates: PolledGate[]; version: string | null } {
  const { sectionId, intervalMs = 4000, refreshOnChange = true } = options ?? {};
  const router = useRouter();
  const [gates, setGates] = useState<PolledGate[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const versionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) return;
      if (!document.hidden) {
        try {
          const params = new URLSearchParams();
          if (sectionId) params.set("sectionId", sectionId);
          if (versionRef.current) params.set("ifVersion", versionRef.current);
          const res = await fetch(`/api/gates/state?${params}`, { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as
              | { unchanged: true; version: string }
              | { version: string; gates: PolledGate[] };
            if (!cancelled && !("unchanged" in body)) {
              const changed = versionRef.current !== null && versionRef.current !== body.version;
              versionRef.current = body.version;
              setVersion(body.version);
              setGates(body.gates);
              if (changed && refreshOnChange) router.refresh();
            } else if (!cancelled && versionRef.current === null) {
              versionRef.current = body.version;
              setVersion(body.version);
            }
          }
        } catch {
          // transient network failure — next tick retries
        }
      }
      if (!cancelled) timer = setTimeout(poll, intervalMs);
    }

    function onVisible() {
      if (!document.hidden) {
        clearTimeout(timer);
        void poll();
      }
    }

    void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sectionId, intervalMs, refreshOnChange, router]);

  return { gates, version };
}
