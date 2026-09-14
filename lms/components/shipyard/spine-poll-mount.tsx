"use client";

import { useSpinePoll } from "./use-spine-poll";

// Mount-only client island: the spine is a server component, so the poll that
// refreshes it lives in this one-line child (same shape as the Forge's
// components/gate-poll-mount.tsx).
export function SpinePollMount({ enabled }: { enabled: boolean }) {
  useSpinePoll({ enabled });
  return null;
}
