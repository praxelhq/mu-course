"use client";

import { useEffect, useState } from "react";
import { formatGap } from "./format";

// Live cooldown readout. The first paint uses the server's own reading of the
// gap (`initialLabel`), so the markup matches what was rendered — the real
// clock only takes over after mount, and ticks every 15s until it runs out.

export function Countdown({
  until,
  initialLabel,
  prefix = "You can resubmit in",
  doneLabel = "You can resubmit now",
  onElapsed,
}: {
  until: string;
  /** What the server computed at render time. */
  initialLabel: string;
  prefix?: string;
  doneLabel?: string;
  onElapsed?: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const target = new Date(until).getTime();
    function tick() {
      const ms = target - Date.now();
      if (ms <= 0) {
        setDone(true);
        onElapsed?.();
        return false;
      }
      setLabel(formatGap(ms));
      return true;
    }
    if (!tick()) return;
    const id = setInterval(() => {
      if (!tick()) clearInterval(id);
    }, 15_000);
    return () => clearInterval(id);
  }, [until, onElapsed]);

  return (
    <span className="sy-countdown" role="status">
      {done ? doneLabel : `${prefix} ${label}`}
    </span>
  );
}
