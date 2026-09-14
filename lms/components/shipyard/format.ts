// Formatting shared by the Shipyard views.
//
// Every date is formatted in Asia/Kolkata with an explicit locale: the cohort
// is in one timezone, and pinning it keeps server-rendered text identical to
// whatever a client component re-renders (no hydration drift, no "12 Sep" on
// the server and "11 Sep" in a browser set to UTC).

const ZONE = "Asia/Kolkata";

const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  day: "numeric",
  month: "short",
});

const DAY_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDay(iso: string | null): string {
  if (!iso) return "";
  return DAY.format(new Date(iso));
}

export function formatDayTime(iso: string | null): string {
  if (!iso) return "";
  return DAY_TIME.format(new Date(iso));
}

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  return TIME.format(new Date(iso));
}

/** "12m", "3h 20m", "2d" — the shortest honest reading of a gap. */
export function formatGap(ms: number): string {
  if (ms <= 0) return "now";
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rest = mins % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.round(hours / 24);
  return `${days}d`;
}

/** How far off a deadline is, read from the server clock. */
export function untilDeadline(
  deadlineAt: string | null,
  now: string,
): { label: string; soon: boolean } | null {
  if (!deadlineAt) return null;
  const ms = new Date(deadlineAt).getTime() - new Date(now).getTime();
  if (ms <= 0) return { label: `Due ${formatDay(deadlineAt)} · passed`, soon: true };
  return { label: `Due ${formatDay(deadlineAt)} · ${formatGap(ms)} left`, soon: ms < 36 * 3600_000 };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 01 … 06 — station numbers read as a set, not as counting. */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
