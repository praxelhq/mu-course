import { z } from "zod";
import { prisma, hasDatabase } from "@/lib/db";
import { ensureRoom } from "@/lib/rooms";

export const dynamic = "force-dynamic";

const Body = z.object({
  sectionCode: z.string().min(1).max(4),
  handle: z.string().min(2).max(28),
  secret: z.string().min(8).max(64),
  board: z.record(z.string(), z.unknown()),
  locked: z.boolean().optional(),
}).strict();

/// A backup, not a source of truth. The browser is authoritative while a
/// student is playing; this exists so a closed laptop does not lose ninety days
/// of work and so the wall can count the room.
export async function POST(req: Request) {
  if (!hasDatabase) return Response.json({ saved: false, offline: true });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Malformed board." }, { status: 400 });
  const { sectionCode, handle, secret, board, locked } = parsed.data;

  const room = await ensureRoom(sectionCode);
  if (!room) return Response.json({ saved: false, offline: true });

  const player = await prisma.player.findUnique({
    where: { roomId_handle: { roomId: room.id, handle } },
  });
  if (!player || player.secret !== secret) {
    return Response.json({ error: "This is not your board." }, { status: 403 });
  }
  // A locked plan is final. Late writes are ignored rather than rejected, so a
  // slow tab cannot silently undo somebody's submission.
  if (player.lockedAt) return Response.json({ saved: false, locked: true });

  await prisma.player.update({
    where: { id: player.id },
    data: {
      board: board as never,
      lockedAt: locked ? new Date() : null,
    },
  });
  return Response.json({ saved: true, locked: Boolean(locked) });
}
