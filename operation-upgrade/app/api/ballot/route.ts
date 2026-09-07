import { prisma, hasDatabase } from "@/lib/db";
import { ensureRoom } from "@/lib/rooms";
import { planShape, headlineText } from "@/lib/engine/memo";
import { readBoard } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

/// What a student may see of everybody else: the name they chose, the seventy-
/// five seconds they wrote, and the shape of their plan. Never a board, never
/// a tally — the count lives on the wall, because a private live score is
/// anxiety rather than drama.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const section = (url.searchParams.get("section") ?? "").toUpperCase();
  const handle = url.searchParams.get("handle") ?? "";
  if (!section) return Response.json({ error: "Which section?" }, { status: 400 });
  if (!hasDatabase) return Response.json({ candidates: [], votedFor: null, offline: true });

  const room = await ensureRoom(section);
  if (!room) return Response.json({ candidates: [], votedFor: null, offline: true });

  const [pitching, me] = await Promise.all([
    prisma.player.findMany({ where: { roomId: room.id, pitching: true }, orderBy: { seat: "asc" } }),
    handle ? prisma.player.findUnique({ where: { roomId_handle: { roomId: room.id, handle } } }) : null,
  ]);

  return Response.json({
    open: room.phase === "vote",
    votedFor: me?.votedForId ?? null,
    candidates: pitching.map((p) => {
      const board = readBoard(p.board);
      return {
        handle: p.handle,
        headline: board ? headlineText(board) : "",
        shape: board ? planShape(board) : { hire: 0, build: 0, redesign: 0 },
      };
    }),
  }, { headers: { "Cache-Control": "no-store" } });
}
