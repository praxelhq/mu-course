import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import {
  studioActor,
  StudioError,
  sameOrigin,
} from "@/lib/shipyard/studio/auth";
import { actionSchema } from "@/lib/shipyard/studio/contracts";
import {
  performStudioAction,
  studioFileUrl,
  studioState,
} from "@/lib/shipyard/studio/service";
import { instructorState } from "@/lib/shipyard/studio/instructor";
import { submissionExport } from "@/lib/shipyard/studio/export";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof StudioError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 422 },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034"].includes(error.code)
  )
    return Response.json(
      {
        error:
          "This action conflicts with a recent change. Reload and try again.",
      },
      { status: 409 },
    );
  console.error(
    "[studio API]",
    error instanceof Error ? error.name : "unknown",
  );
  return Response.json(
    {
      error:
        "Shipyard is temporarily unavailable. Your saved work is safe. Please try again.",
    },
    { status: 503 },
  );
}
export async function GET(req: Request) {
  try {
    const actor = await studioActor(req),
      url = new URL(req.url);
    if (url.searchParams.has("export")) return await submissionExport(actor);
    if (url.searchParams.has("file"))
      return Response.redirect(
        await studioFileUrl(actor, url.searchParams.get("file")!),
        302,
      );
    if (url.searchParams.has("instructor")) {
      if (!actor.staff)
        throw new StudioError(403, "Instructor access required.");
      return Response.json(await instructorState(), {
        headers: { "cache-control": "no-store" },
      });
    }
    return Response.json(
      await studioState(actor, url.searchParams.get("workspace") || undefined),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const actor = await studioActor(req);
    if (Number(req.headers.get("content-length") || 0) > 300000)
      throw new StudioError(413, "This request is too large.");
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.length;
          if (bytes > 300000) {
            await reader.cancel();
            throw new StudioError(413, "This request is too large.");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const text = Buffer.concat(chunks).toString("utf8");
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new StudioError(400, "Invalid request.");
    }
    return Response.json(
      await performStudioAction(actor, actionSchema.parse(body)),
    );
  } catch (error) {
    return failure(error);
  }
}
