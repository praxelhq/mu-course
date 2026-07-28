"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// U13 — tiny generic auto-refresh: router.refresh() on an interval, paused
// while the tab is hidden (same visibility discipline as use-gate-poll, which
// stays gate-specific). Mount it inside any server-component page that should
// stay live, e.g. the admin interviews meter.

export function useIntervalRefresh(intervalMs = 10_000): void {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) router.refresh();
    };
    const t = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);
}

export function IntervalRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  useIntervalRefresh(intervalMs);
  return null;
}
