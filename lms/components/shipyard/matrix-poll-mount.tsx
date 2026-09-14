"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// The matrix's own short poll. Same content-hash pattern as the spine's, on an
// eight-second tick rather than four: a student watching their own gate is
// waiting for one specific thing to move, an instructor watching a section is
// reading a shape. Eight seconds keeps the wall-display honest without asking
// the database for 360 cells fifteen times a minute per open tab.
//
// Polling pauses while the tab is hidden and fires immediately on return.

export function MatrixPollMount({
  sectionId,
  version,
  intervalMs = 8000,
}: {
  sectionId: string;
  /** The version the server just rendered; the first poll compares to it. */
  version: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const seen = useRef(version);

  useEffect(() => {
    seen.current = version;
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (cancelled) return;
      if (!document.hidden) {
        try {
          const params = new URLSearchParams({ sectionId, ifVersion: seen.current });
          const res = await fetch(`/api/shipyard/instructor/matrix?${params}`, {
            cache: "no-store",
          });
          if (res.ok) {
            const body = (await res.json()) as { version: string; unchanged?: true };
            if (!cancelled && body.version !== seen.current) {
              seen.current = body.version;
              router.refresh();
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

    timer = setTimeout(poll, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sectionId, intervalMs, router]);

  return null;
}
