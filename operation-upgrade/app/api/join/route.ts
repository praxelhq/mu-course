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

  // Sixty laptops hit this within about a minute of each other, and a good
  // number of them within the same second. Reading the seat count and then
  // writing it is a race that loses students at the door, so the whole
  // allocation is serialised per room by a Postgres advisory lock — the same
  // shape the LMS uses for its peer-review round.
  try {
    const result = await prisma.$transaction(async (tx) => {
      // ::text because the lock function returns void, which Prisma cannot
      // deserialise out of a raw query. Same shape as the LMS peer-review lock.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${room.id}, 0))::text`;

      const existing = await tx.player.findUnique({
        where: { roomId_handle: { roomId: room.id, handle } },
      });
      if (existing) {
        if (existing.secret !== secret) return { conflict: true as const };
        return { seat: existing.seat, board: existing.board, resumed: true as const };
      }

      const highest = await tx.player.aggregate({
        where: { roomId: room.id },
        _max: { seat: true },
      });
      const player = await tx.player.create({
        data: { roomId: room.id, handle, secret, seat: (highest._max.seat ?? -1) + 1 },
      });
      return { seat: player.seat, resumed: false as const };
    }, { maxWait: 15_000, timeout: 20_000 });

    if ("conflict" in result) {
      return Response.json(
        { error: "Somebody in this section is already using that name. Add a surname or an initial." },
        { status: 409 },
      );
    }
    return Response.json({ sectionCode, ...result });
  } catch {
    // Never a blank 500 at the door of a live class.
    return Response.json(
      { error: "The room is busy letting people in. Give it a second and try again." },
      { status: 503 },
    );
  }
}
