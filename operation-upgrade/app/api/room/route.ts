import { roomState } from "@/lib/rooms";

export const dynamic = "force-dynamic";

/// Polled by every student every few seconds. Small on purpose: the phase, a
/// clock, and a version number. The board itself never travels this way.
export async function GET(req: Request) {
  const section = new URL(req.url).searchParams.get("section");
  if (!section) return Response.json({ error: "Which section?" }, { status: 400 });
  const state = await roomState(section.toUpperCase());
  return Response.json({ ...state, serverNow: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
