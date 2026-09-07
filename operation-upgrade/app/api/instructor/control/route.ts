import { z } from "zod";
import { prisma, hasDatabase } from "@/lib/db";
import { ensureRoom, isFacilitator } from "@/lib/rooms";
import { nextPhase, prevPhase, PHASE_IDS, type PhaseId } from "@/lib/phases";

export const dynamic = "force-dynamic";

const Body = z.object({
  key: z.string().min(1),
  section: z.string().min(1).max(4),
  action: z.enum(["advance", "back", "goto", "timer", "clear-timer", "pitch", "unpitch", "unlock", "reset", "pacing"]),
  phase: z.string().optional(),
  minutes: z.number().int().min(1).max(60).optional(),
  handle: z.string().max(28).optional(),
  pacing: z.enum(["guided", "open"]).optional(),
}).strict();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Malformed action." }, { status: 400 });
  const { key, section, action, phase, minutes, handle, pacing } = parsed.data;

  if (!isFacilitator(key)) return Response.json({ error: "Not for students." }, { status: 403 });
  if (!hasDatabase) return Response.json({ error: "No database attached." }, { status: 503 });

  const room = await ensureRoom(section.toUpperCase());
  if (!room) return Response.json({ error: "Room unavailable." }, { status: 503 });

  const current = room.phase as PhaseId;

  if (action === "advance" || action === "back" || action === "goto") {
    const target =
      action === "goto"
        ? (PHASE_IDS.includes(phase as PhaseId) ? (phase as PhaseId) : null)
        : action === "advance" ? nextPhase(current) : prevPhase(current);
    if (!target) return Response.json({ error: "Nowhere to go from here." }, { status: 409 });
    await prisma.room.update({
      where: { id: room.id },
      data: { phase: target, phaseStartedAt: new Date(), phaseEndsAt: null, version: { increment: 1 } },
    });
    return Response.json({ ok: true, phase: target });
  }

  if (action === "pacing") {
    await prisma.room.update({
      where: { id: room.id },
      data: { pacing: pacing ?? "open", version: { increment: 1 } },
    });
    return Response.json({ ok: true, pacing: pacing ?? "open" });
  }

  if (action === "timer") {
    const ends = new Date(Date.now() + (minutes ?? 5) * 60_000);
    await prisma.room.update({ where: { id: room.id }, data: { phaseEndsAt: ends, version: { increment: 1 } } });
    return Response.json({ ok: true, phaseEndsAt: ends.toISOString() });
  }

  if (action === "clear-timer") {
    await prisma.room.update({ where: { id: room.id }, data: { phaseEndsAt: null, version: { increment: 1 } } });
    return Response.json({ ok: true });
  }

  if (action === "pitch" || action === "unpitch") {
    if (!handle) return Response.json({ error: "Which student?" }, { status: 400 });
    await prisma.player.updateMany({
      where: { roomId: room.id, handle },
      data: { pitching: action === "pitch" },
    });
    return Response.json({ ok: true });
  }

  if (action === "unlock") {
    if (!handle) return Response.json({ error: "Which student?" }, { status: 400 });
    await prisma.player.updateMany({ where: { roomId: room.id, handle }, data: { lockedAt: null } });
    return Response.json({ ok: true });
  }

  // Reset wipes the section back to the start. Deliberately blunt, and only
  // ever used before a class begins.
  await prisma.$transaction([
    prisma.player.deleteMany({ where: { roomId: room.id } }),
    prisma.room.update({
      where: { id: room.id },
      data: { phase: "arrival", phaseEndsAt: null, version: { increment: 1 } },
    }),
  ]);
  return Response.json({ ok: true, reset: true });
}
