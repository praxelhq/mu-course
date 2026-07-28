import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { upsertOwnPortfolio } from "@/lib/portfolio";

// U16 — save the caller's OWN portfolio entry (narrative + external links).
// Ownership is structural: the route takes no userId — the entry written is
// always the session user's, so student B cannot touch student A's entry.
// Validations and lastCrawl are not writable here (instructor form / crawl
// worker own those).

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  narrative: z.string().max(5000).nullable().optional(),
  links: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        url: z
          .string()
          .max(2048)
          .regex(/^https?:\/\/\S+$/, "must be an http(s) URL"),
      }),
    )
    .max(20)
    .optional(),
});

export const POST = withAuth(async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body", issues: parsed.error.issues.map((i) => i.message) },
      { status: 422 },
    );
  }
  await upsertOwnPortfolio(user.userId, parsed.data);
  return Response.json({ ok: true });
});
