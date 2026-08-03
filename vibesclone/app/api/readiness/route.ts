import { prisma } from "@/lib/db";
import { hasDodoConfig } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const token = process.env.READINESS_TOKEN;
  if (token && request.headers.get("authorization") !== `Bearer ${token}`) return Response.json({ ok: false }, { status: 401 });
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: "ready", providers: { clerk: Boolean(process.env.CLERK_SECRET_KEY), dodo: hasDodoConfig(), resend: Boolean(process.env.RESEND_API_KEY), firecrawl: Boolean(process.env.FIRECRAWL_API_KEY), openrouter: Boolean(process.env.OPENROUTER_API_KEY), clarity: Boolean(process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID) } });
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
