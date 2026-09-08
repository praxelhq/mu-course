import { prisma } from "@/lib/db";
import { findBlueprint } from "@/lib/blueprints";
import { eventInputSchema } from "@/lib/product-events";
import { allowRequest } from "@/lib/request-rate-limit";

export async function POST(request: Request): Promise<Response> {
  if (!allowRequest(request, "product-events", 120, 60_000)) return new Response(null, { status: 204 });
  const parsed = eventInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unknown product event." }, { status: 400 });
  if (parsed.data.blueprintSlug && !findBlueprint(parsed.data.blueprintSlug)) return Response.json({ error: "Unknown product event." }, { status: 400 });
  try {
    await prisma.productEvent.create({ data: parsed.data });
  } catch {
    // Analytics must never block or visibly break the action being measured.
  }
  return new Response(null, { status: 204 });
}
