import { prisma, hasDatabase } from "@/lib/db";
import type { PhaseId } from "@/lib/phases";

/// Join codes are configured, not generated: the facilitator puts one on the
/// wall and the room types it. No accounts, no invites, no email.
export function joinCodes(): Map<string, string> {
  const raw = process.env.JOIN_CODES ?? "bharat:A";
  const pairs = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const map = new Map<string, string>();
  for (const pair of pairs) {
    const [code, section] = pair.split(":");
    if (code && section) map.set(code.trim().toLowerCase(), section.trim().toUpperCase());
  }
  return map;
}

export function sectionForCode(code: string): string | null {
  return joinCodes().get(code.trim().toLowerCase()) ?? null;
}

export function isFacilitator(key: string | null | undefined): boolean {
  const expected = process.env.FACILITATOR_KEY;
  if (!expected) return false;
  return Boolean(key) && key === expected;
}

export async function ensureRoom(sectionCode: string) {
  if (!hasDatabase) return null;
  return prisma.room.upsert({
    where: { sectionCode },
    update: {},
    create: { sectionCode },
  });
}

export async function roomState(sectionCode: string) {
  // With no database there is no facilitator, so nothing is gated at all.
  if (!hasDatabase) return { phase: "offer" as PhaseId, pacing: "open", version: 0, phaseEndsAt: null as string | null, offline: true };
  const room = await ensureRoom(sectionCode);
  if (!room) return { phase: "offer" as PhaseId, pacing: "open", version: 0, phaseEndsAt: null, offline: true };
  return {
    phase: room.phase as PhaseId,
    pacing: room.pacing,
    version: room.version,
    phaseEndsAt: room.phaseEndsAt?.toISOString() ?? null,
    offline: false,
  };
}
