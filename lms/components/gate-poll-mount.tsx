"use client";

import { useGatePoll } from "./use-gate-poll";

// Invisible mount for server-rendered hub pages: polls the gate snapshot and
// router.refresh()es on change, so unlocks propagate live (<5s) without any
// client-side data plumbing.
export function GatePollMount({ sectionId }: { sectionId?: string }) {
  useGatePoll({ sectionId });
  return null;
}
