import { z } from "zod";
import { prisma, hasDatabase } from "@/lib/db";
import { ensureRoom, sectionForCode } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().min(1).max(64),
  handle: z.string().trim().min(2).max(28),
  secret: z.string().min(8).max(64),
}).strict();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Check the code and the name you typed." }, { status: 400 });
  }
  const { code, handle, secret } = parsed.data;

  const sectionCode = sectionForCode(code);
  if (!sectionCode) {
    return Response.json({ error: "That code is not one of ours. Check the wall." }, { status: 404 });
  }

  // Without a database the game still runs — the browser holds everything and
  // the seat is derived from the name, so cards are still dealt consistently.
  if (!hasDatabase) {
    const seat = [...handle].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7);
    return Response.json({ sectionCode, seat, offline: true });
  }

  const room = await ensureRoom(sectionCode);
  if (!room) return Response.json({ error: "The room is not ready yet." }, { status: 503 });

  const existing = await prisma.player.findUnique({
    where: { roomId_handle: { roomId: room.id, handle } },
  });

  if (existing) {
    if (existing.secret !== secret) {
      return Response.json(
        { error: "Somebody in this section is already using that name. Add a surname or an initial." },
        { status: 409 },
      );
    }
    return Response.json({ sectionCode, seat: existing.seat, board: existing.board, resumed: true });
  }

  const taken = await prisma.player.count({ where: { roomId: room.id } });
  const player = await prisma.player.create({
    data: { roomId: room.id, handle, secret, seat: taken },
  });
  return Response.json({ sectionCode, seat: player.seat, resumed: false });
}
