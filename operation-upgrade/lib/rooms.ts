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
  try {
    return await prisma.room.upsert({ where: { sectionCode }, update: {}, create: { sectionCode } });
  } catch {
    // Two students can create the same room in the same millisecond. The
    // loser of that race just reads what the winner made.
    return prisma.room.findUnique({ where: { sectionCode } });
  }
}

/// Read-only. Sixty students poll this every three seconds; doing an upsert on
/// each one would be twenty writes a second to answer "what phase are we on".
export async function readRoom(sectionCode: string) {
  if (!hasDatabase) return null;
  return prisma.room.findUnique({ where: { sectionCode } });
}

export async function roomState(sectionCode: string) {
  // With no database there is no facilitator, so nothing is gated at all.
  if (!hasDatabase) return { phase: "offer" as PhaseId, pacing: "open", version: 0, phaseEndsAt: null as string | null, offline: true };
  const room = await readRoom(sectionCode);
  // No room yet simply means the facilitator has not opened this section.
  if (!room) return { phase: "arrival" as PhaseId, pacing: "guided", version: 0, phaseEndsAt: null, offline: false };
  return {
    phase: room.phase as PhaseId,
    pacing: room.pacing,
    version: room.version,
    phaseEndsAt: room.phaseEndsAt?.toISOString() ?? null,
    offline: false,
  };
}
