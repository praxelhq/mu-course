import { z } from "zod";
import { prisma, hasDatabase } from "@/lib/db";
import { ensureRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const Body = z.object({
  sectionCode: z.string().min(1).max(4),
  handle: z.string().min(2).max(28),
  secret: z.string().min(8).max(64),
  votedFor: z.string().min(2).max(28),
}).strict();

/// One vote each, never for yourself. Changeable while the ballot is open,
/// because a student who mis-taps should not have to find a facilitator.
export async function POST(req: Request) {
  if (!hasDatabase) return Response.json({ error: "No database attached." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Malformed vote." }, { status: 400 });
  const { sectionCode, handle, secret, votedFor } = parsed.data;

  if (votedFor === handle) {
    return Response.json({ error: "You cannot fund your own plan." }, { status: 400 });
  }

  const room = await ensureRoom(sectionCode.toUpperCase());
  if (!room) return Response.json({ error: "Room unavailable." }, { status: 503 });
  if (room.phase !== "vote") return Response.json({ error: "The ballot is not open." }, { status: 409 });

  const voter = await prisma.player.findUnique({ where: { roomId_handle: { roomId: room.id, handle } } });
  if (!voter || voter.secret !== secret) return Response.json({ error: "That is not your vote to cast." }, { status: 403 });

  const target = await prisma.player.findUnique({ where: { roomId_handle: { roomId: room.id, handle: votedFor } } });
  if (!target?.pitching) return Response.json({ error: "That plan is not on the ballot." }, { status: 404 });

  await prisma.player.update({ where: { id: voter.id }, data: { votedForId: votedFor } });
  return Response.json({ ok: true });
}
