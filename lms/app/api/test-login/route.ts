import { prisma } from "@/lib/db";
import { isTestLoginEnabled, TEST_LOGIN_COOKIE } from "@/lib/auth/test-login";

// Dev/test-only login backdoor for Playwright and local dev without Clerk
// keys. POST { userId } sets the forge_test_user cookie; DELETE clears it.
// Returns 404 unless BOTH NODE_ENV !== 'production' AND ENABLE_TEST_LOGIN is
// truthy (the flag alone is insufficient). instrumentation.ts additionally
// refuses to boot production with the flag set.

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export async function POST(req: Request): Promise<Response> {
  if (!isTestLoginEnabled()) return notFound();

  let userId: unknown;
  try {
    ({ userId } = await req.json());
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof userId !== "string" || !userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) return Response.json({ error: "Unknown userId" }, { status: 404 });

  const res = Response.json({ ok: true, user });
  res.headers.append(
    "set-cookie",
    `${TEST_LOGIN_COOKIE}=${encodeURIComponent(user.id)}; Path=/; HttpOnly; SameSite=Lax`,
  );
  return res;
}

export async function DELETE(): Promise<Response> {
  if (!isTestLoginEnabled()) return notFound();
  const res = Response.json({ ok: true });
  res.headers.append(
    "set-cookie",
    `${TEST_LOGIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  return res;
}
