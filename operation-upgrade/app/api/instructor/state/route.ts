import { prisma, hasDatabase } from "@/lib/db";
import { ensureRoom, isFacilitator } from "@/lib/rooms";
import { roomView, type RoomPlayer } from "@/lib/engine/room";
import type { Board } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isFacilitator(url.searchParams.get("key"))) {
    return Response.json({ error: "Not for students." }, { status: 403 });
  }
  const section = (url.searchParams.get("section") ?? "").toUpperCase();
  if (!section) return Response.json({ error: "Which section?" }, { status: 400 });
  if (!hasDatabase) return Response.json({ error: "No database is attached, so there is no room to show." }, { status: 503 });

  const room = await ensureRoom(section);
  if (!room) return Response.json({ error: "Room unavailable." }, { status: 503 });

  const players = await prisma.player.findMany({
    where: { roomId: room.id },
    orderBy: { seat: "asc" },
  });

  const votes: Record<string, number> = {};
  for (const p of players) {
    if (p.votedForId) votes[p.votedForId] = (votes[p.votedForId] ?? 0) + 1;
  }

  const view = roomView(
    players.map((p): RoomPlayer => ({
      handle: p.handle, seat: p.seat, locked: Boolean(p.lockedAt), pitching: p.pitching,
      board: p.board as unknown as Board,
    })),
    votes,
  );

  const spread: Record<string, number> = {};
  for (const p of players) spread[p.stage] = (spread[p.stage] ?? 0) + 1;

  return Response.json({
    section, phase: room.phase, pacing: room.pacing, spread, version: room.version,
    phaseEndsAt: room.phaseEndsAt?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
    view,
    roster: players.map((p) => ({
      handle: p.handle, seat: p.seat, locked: Boolean(p.lockedAt), pitching: p.pitching,
      stage: p.stage,
      headline: (p.board as { headline?: string })?.headline ?? "",
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
