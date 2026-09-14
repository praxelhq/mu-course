// The resubmit cooldown. Pure, so the form, the API and the worker all agree
// about the same instant — a student who is told "4 minutes" by the page and
// refused by the route two minutes later has been lied to by one of them.

/** The instant a student may resubmit, given when they last submitted. */
export function nextAllowedResubmitAt(
  lastSubmittedAt: Date,
  cooldownMinutes: number,
): Date {
  const minutes = Number.isFinite(cooldownMinutes) ? Math.max(0, cooldownMinutes) : 0;
  return new Date(lastSubmittedAt.getTime() + minutes * 60_000);
}

export type CooldownStatus = {
  allowed: boolean;
  remainingMs: number;
  /** Short, plain, and never negative: "4 minutes", "in a moment". */
  humanText: string;
};

/** Round up: telling someone "0 minutes" while refusing them reads as a bug. */
function humanise(remainingMs: number): string {
  if (remainingMs <= 0) return "now";
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds < 60) return seconds === 1 ? "1 second" : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** How long is left on the cooldown. A null fence means no cooldown is set. */
export function cooldownRemaining(
  now: Date,
  nextAllowedAt: Date | null | undefined,
): CooldownStatus {
  if (!nextAllowedAt) return { allowed: true, remainingMs: 0, humanText: "now" };
  const remainingMs = nextAllowedAt.getTime() - now.getTime();
  if (remainingMs <= 0) return { allowed: true, remainingMs: 0, humanText: "now" };
  return { allowed: false, remainingMs, humanText: humanise(remainingMs) };
}
