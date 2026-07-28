import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseSubmissionSchema } from "@/lib/submission-schema";

// U16 — the portfolio module: one place that interprets PortfolioEntry's
// three JSON fields (links / validations / lastCrawl) and gathers the URL set
// the liveness crawl checks. The scorer (lib/scoring/assemble) reads the SAME
// lastCrawl contract:
//   { checkedAt: string(ISO), links: [{ url, ok, status? }] }

export type PortfolioLink = { label: string; url: string };

export type PortfolioValidation = {
  kind: "external" | "peer";
  by: string;
  note: string;
  at: string; // ISO
};

export type CrawledLink = { url: string; ok: boolean; status?: number };
export type LastCrawl = { checkedAt: string; links: CrawledLink[] };

/** Types a "complete" portfolio must show a graded submission for (§7). */
export const PORTFOLIO_REQUIRED_SLUGS = [
  "skill",
  "data-memo",
  "app",
  "workflow",
  "media",
  "value-chain-map",
] as const;

const TEAM_SLUGS = new Set(["workflow", "media", "value-chain-map"]);

// ---------------------------------------------------------------------------
// JSON parsers (tolerant: seeded rows store {submissions:[…], external:[…]},
// the API writes the same object shape; a bare array of {label,url} is also
// accepted so hand-edited rows never crash a page).
// ---------------------------------------------------------------------------

function isLink(v: unknown): v is PortfolioLink {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as PortfolioLink).label === "string" &&
    typeof (v as PortfolioLink).url === "string"
  );
}

/** External links out of PortfolioEntry.links (object.external or array). */
export function parseExternalLinks(json: Prisma.JsonValue | null | undefined): PortfolioLink[] {
  if (Array.isArray(json)) return json.filter(isLink);
  if (json && typeof json === "object") {
    const external = (json as { external?: unknown }).external;
    if (Array.isArray(external)) return external.filter(isLink);
  }
  return [];
}

export function parseValidations(
  json: Prisma.JsonValue | null | undefined,
): PortfolioValidation[] {
  if (!Array.isArray(json)) return [];
  const out: PortfolioValidation[] = [];
  for (const v of json) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    if (r.kind !== "external" && r.kind !== "peer") continue;
    out.push({
      kind: r.kind,
      by: typeof r.by === "string" ? r.by : "",
      note: typeof r.note === "string" ? r.note : "",
      at: typeof r.at === "string" ? r.at : "",
    });
  }
  return out;
}

export function parseLastCrawl(json: Prisma.JsonValue | null | undefined): LastCrawl | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const r = json as { checkedAt?: unknown; links?: unknown };
  if (typeof r.checkedAt !== "string" || !Array.isArray(r.links)) return null;
  const links: CrawledLink[] = [];
  for (const l of r.links) {
    if (!l || typeof l !== "object") continue;
    const row = l as Record<string, unknown>;
    if (typeof row.url !== "string" || typeof row.ok !== "boolean") continue;
    links.push({
      url: row.url,
      ok: row.ok,
      ...(typeof row.status === "number" ? { status: row.status } : {}),
    });
  }
  return { checkedAt: r.checkedAt, links };
}

// ---------------------------------------------------------------------------
// Crawl URL gathering
// ---------------------------------------------------------------------------

/**
 * Every URL the liveness crawl should check for one student: the portfolio's
 * external links plus every link-kind field value across their SUBMITTED
 * submissions (appUrl / githubUrl / skillLink …, discovered from each
 * assignment type's submissionSchema — never a hardcoded field list).
 * De-duplicated, insertion-ordered.
 */
export async function gatherCrawlUrls(userId: string): Promise<string[]> {
  const [entry, submissions] = await Promise.all([
    prisma.portfolioEntry.findUnique({ where: { userId }, select: { links: true } }),
    prisma.submission.findMany({
      where: { userId, status: { not: "draft" } },
      select: {
        fields: true,
        assignment: { select: { assignmentType: { select: { submissionSchema: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const urls = new Set<string>();
  for (const link of parseExternalLinks(entry?.links)) {
    if (/^https?:\/\//.test(link.url)) urls.add(link.url);
  }
  for (const sub of submissions) {
    const schema = parseSubmissionSchema(sub.assignment.assignmentType.submissionSchema);
    if (!schema || !sub.fields || typeof sub.fields !== "object" || Array.isArray(sub.fields)) {
      continue;
    }
    const fields = sub.fields as Record<string, unknown>;
    for (const def of schema.fields) {
      if (def.kind !== "link") continue;
      const value = fields[def.key];
      if (typeof value === "string" && /^https?:\/\//.test(value)) urls.add(value);
    }
  }
  return [...urls];
}

// ---------------------------------------------------------------------------
// Page/view assembly
// ---------------------------------------------------------------------------

export type ArtifactChecklistRow = {
  slug: string;
  title: string;
  teamBased: boolean;
  /** A graded/finalised submission exists for the owner (user or team). */
  present: boolean;
};

/** The §7 completeness checklist — same owner rule as the scorer. */
export async function getArtifactChecklist(userId: string): Promise<ArtifactChecklistRow[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true },
  });
  const types = await prisma.assignmentType.findMany({
    where: { slug: { in: [...PORTFOLIO_REQUIRED_SLUGS] } },
    select: { slug: true, title: true },
  });
  const titleBySlug = new Map(types.map((t) => [t.slug, t.title]));

  return Promise.all(
    PORTFOLIO_REQUIRED_SLUGS.map(async (slug) => {
      const teamBased = TEAM_SLUGS.has(slug);
      let present = false;
      if (!teamBased || user?.teamId) {
        const count = await prisma.submission.count({
          where: {
            ...(teamBased ? { teamId: user!.teamId! } : { userId }),
            assignment: { assignmentType: { slug } },
            status: { in: ["graded", "finalised"] },
          },
        });
        present = count > 0;
      }
      return { slug, title: titleBySlug.get(slug) ?? slug, teamBased, present };
    }),
  );
}

/**
 * Upsert the student's OWN entry. Only narrative and external links are
 * writable here; validations and lastCrawl are owned by the instructor form
 * and the crawl worker respectively. Non-link keys already stored in the
 * links JSON (e.g. the seeded `submissions` array) are preserved.
 */
export async function upsertOwnPortfolio(
  userId: string,
  patch: { narrative?: string | null; links?: PortfolioLink[] },
): Promise<void> {
  const existing = await prisma.portfolioEntry.findUnique({
    where: { userId },
    select: { links: true },
  });

  let linksJson: Prisma.InputJsonValue | undefined;
  if (patch.links !== undefined) {
    const base =
      existing?.links && typeof existing.links === "object" && !Array.isArray(existing.links)
        ? (existing.links as Record<string, unknown>)
        : {};
    linksJson = { ...base, external: patch.links } as Prisma.InputJsonValue;
  }

  await prisma.portfolioEntry.upsert({
    where: { userId },
    create: {
      userId,
      narrative: patch.narrative ?? null,
      links: (linksJson ?? { external: [] }) as Prisma.InputJsonValue,
      validations: [] as unknown as Prisma.InputJsonValue,
    },
    update: {
      ...(patch.narrative !== undefined ? { narrative: patch.narrative } : {}),
      ...(linksJson !== undefined ? { links: linksJson } : {}),
    },
  });
}

/**
 * Append an instructor/admin-entered validation to a student's entry
 * (creating the entry when absent). Returns the new validations list.
 */
export async function appendValidation(
  userId: string,
  validation: PortfolioValidation,
): Promise<PortfolioValidation[]> {
  const existing = await prisma.portfolioEntry.findUnique({
    where: { userId },
    select: { validations: true },
  });
  const next = [...parseValidations(existing?.validations), validation];
  await prisma.portfolioEntry.upsert({
    where: { userId },
    create: {
      userId,
      links: { external: [] } as Prisma.InputJsonValue,
      validations: next as unknown as Prisma.InputJsonValue,
    },
    update: { validations: next as unknown as Prisma.InputJsonValue },
  });
  return next;
}
