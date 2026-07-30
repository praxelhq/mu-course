export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ ok: true, service: "vibesclone-web", sha: process.env.RAILWAY_GIT_COMMIT_SHA ?? "local" });
}
