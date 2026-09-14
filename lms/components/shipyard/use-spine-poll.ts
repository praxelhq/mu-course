"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Live gate propagation for the Shipyard spine, mirroring
// components/use-gate-poll.ts: short-poll a content-hashed snapshot every 4s
// and router.refresh() when the hash moves, so a checkpoint that clears while
// the student is watching unlocks the next one in front of them (SPEC §5).
//
// Two deliberate differences from the Forge hook:
//   • It tolerates the endpoint not existing yet (any non-200 is ignored and
//     retried) — the UI ships before the data layer, and a 404 must not spam
//     the console or stall the page.
//   • It only runs while something is actually in review; a settled spine has
//     nothing to poll for.
//
// Polling pauses while the tab is hidden and fires immediately on return.

export function useSpinePoll(options?: {
  /** Poll at all. Pass false when nothing on screen is pending. */
  enabled?: boolean;
  intervalMs?: number;
}): void {
  const { enabled = true, intervalMs = 4000 } = options ?? {};
  const router = useRouter();
  const versionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) return;
      if (!document.hidden) {
        try {
          const params = new URLSearchParams();
          if (versionRef.current) params.set("ifVersion", versionRef.current);
          const res = await fetch(`/api/shipyard/spine?${params}`, { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as
              | { unchanged: true; version: string }
              | { version: string };
            const seen = versionRef.current;
            versionRef.current = body.version;
            if (!cancelled && seen !== null && seen !== body.version) router.refresh();
          }
          // Anything else (including the 404 this endpoint returns until the
          // data layer lands) is a no-op: try again on the next tick.
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
  }, [enabled, intervalMs, router]);
}
