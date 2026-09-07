// Unauthenticated liveness probe for Railway's healthcheck (see railway.json).
// Listed as a public route in proxy.ts so it never touches Clerk or the DB.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ ok: true, service: "web" });
}
