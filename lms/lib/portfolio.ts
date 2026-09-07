import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseSubmissionSchema } from "@/lib/submission-schema";
import {
  parseExportPolicy,
  parsePortfolioPolicy,
  type PortfolioPolicy,
} from "@/lib/assessment-policies";

// The portfolio module: one place that interprets PortfolioEntry's
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

/** Team-based required slugs count the TEAM's submission, not the student's. */
export function isTeamPortfolioSlug(slug: string): boolean {
  return TEAM_SLUGS.has(slug);
}

/**
 * The §7 presence rule, shared with the scorer (lib/scoring/assemble): a
 * graded/finalised submission exists for the slug's owner — the team for
 * team-based slugs (false when the student has no team), else the student.
 */
export async function hasGradedArtifact(
  owner: { userId: string; teamId: string | null },
  slug: string,
): Promise<boolean> {
  const teamBased = isTeamPortfolioSlug(slug);
  if (teamBased && !owner.teamId) return false;
  const count = await prisma.submission.count({
    where: {
      ...(teamBased ? { teamId: owner.teamId! } : { userId: owner.userId }),
      assessmentVersionId: null,
      assignment: { assignmentType: { slug } },
      status: { in: ["graded", "finalised"] },
    },
  });
  return count > 0;
}

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

function canonicalPublicHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export type ArtifactChecklistState =
  | "artifact-missing"
  | "artifact-complete"
  | "public-link-missing"
  | "public-link-unverified"
  | "complete";

export const ARTIFACT_CHECKLIST_STATE_COPY: Record<ArtifactChecklistState, string> = {
  "artifact-missing": "Not yet",
  "artifact-complete": "Graded",
  "public-link-missing": "Public link needed",
  "public-link-unverified": "Link check pending or failed",
  complete: "Complete",
};

/** Resolve artifact presence plus an optional exact-label, live-HTTPS gate. */
export function resolveArtifactChecklistState(
  artifactPresent: boolean,
  policy: PortfolioPolicy | null,
  links: readonly PortfolioLink[],
  lastCrawl: LastCrawl | null,
): ArtifactChecklistState {
  if (!artifactPresent) return "artifact-missing";
  const requirement = policy?.requiredPublicLink;
  if (!requirement) return "artifact-complete";

  const matchingUrls = links.flatMap((link) => {
    if (link.label.trim() !== requirement.label) return [];
    const canonical = canonicalPublicHttpsUrl(link.url);
    return canonical ? [canonical] : [];
  });
  if (matchingUrls.length === 0) return "public-link-missing";
  if (!lastCrawl) return "public-link-unverified";

  const requiredUrls = new Set(matchingUrls);
  const hasLiveUrl = lastCrawl.links.some((link) => {
    if (!link.ok) return false;
    const canonical = canonicalPublicHttpsUrl(link.url);
    return canonical !== null && requiredUrls.has(canonical);
  });
  return hasLiveUrl
    ? "complete"
    : "public-link-unverified";
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
        assessmentVersionId: true,
        assessmentVersion: { select: { exportPolicy: true } },
        assignment: {
          select: {
            assignmentType: { select: { submissionSchema: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const urls = new Set<string>();
  for (const link of parseExternalLinks(entry?.links)) {
    if (/^https?:\/\//.test(link.url)) urls.add(link.url);
  }
  for (const sub of submissions) {
    if (!sub.fields || typeof sub.fields !== "object" || Array.isArray(sub.fields)) {
      continue;
    }
    const fields = sub.fields as Record<string, unknown>;
    if (sub.assessmentVersionId) {
      const exportPolicy = parseExportPolicy(sub.assessmentVersion?.exportPolicy);
      if (!exportPolicy?.praxy.enabled) continue;
      for (const key of exportPolicy.praxy.fieldKeys) {
        const value = fields[key];
        if (
          typeof value === "string" &&
          /^https:\/\//.test(value) &&
          !/https:\/\/[^/]*trustmrr\.com\b/i.test(value)
        ) {
          urls.add(value);
        }
      }
    } else {
      const schema = parseSubmissionSchema(sub.assignment.assignmentType.submissionSchema);
      if (!schema) continue;
      for (const def of schema.fields) {
        if (def.kind !== "link") continue;
        const value = fields[def.key];
        if (typeof value === "string" && /^https?:\/\//.test(value)) urls.add(value);
      }
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
  completionState: ArtifactChecklistState;
};

type PortfolioSlotDefinition =
  | {
      kind: "legacy";
      slot: string;
      slug: string;
      title: string;
      ownerKind: "individual" | "team";
    }
  | {
      kind: "versioned";
      slot: string;
      assignmentId: string;
      title: string;
      ownerKind: "individual" | "team";
      policy: PortfolioPolicy;
    };

export function mergePortfolioSlotDefinitions(
  legacy: readonly PortfolioSlotDefinition[],
  versioned: readonly PortfolioSlotDefinition[],
): PortfolioSlotDefinition[] {
  const slots = new Map<string, PortfolioSlotDefinition>();
  for (const definition of legacy) slots.set(definition.slot, definition);
  for (const definition of versioned) slots.set(definition.slot, definition);
  return [...slots.values()];
}

async function getPortfolioSlotDefinitions(): Promise<PortfolioSlotDefinition[]> {
  const [legacyTypes, assignments] = await Promise.all([
    prisma.assignmentType.findMany({
      where: { slug: { in: [...PORTFOLIO_REQUIRED_SLUGS] } },
      select: { slug: true, title: true },
    }),
    prisma.assignment.findMany({
      where: {
        contractMode: "versioned",
        activeAssessmentVersionId: { not: null },
        activeAssessmentVersion: { purpose: "graded" },
      },
      select: {
        id: true,
        title: true,
        activeAssessmentVersion: {
          select: { ownerKind: true, purpose: true, portfolioPolicy: true },
        },
      },
    }),
  ]);
  const legacyTitle = new Map(legacyTypes.map((type) => [type.slug, type.title]));
  const legacy: PortfolioSlotDefinition[] = PORTFOLIO_REQUIRED_SLUGS.map((slug) => ({
    kind: "legacy",
    slot: slug,
    slug,
    title: legacyTitle.get(slug) ?? slug,
    ownerKind: isTeamPortfolioSlug(slug) ? "team" : "individual",
  }));
  const versioned: PortfolioSlotDefinition[] = assignments.flatMap((assignment) => {
    const active = assignment.activeAssessmentVersion;
    const policy = parsePortfolioPolicy(active?.portfolioPolicy);
    if (!active || active.purpose !== "graded" || !policy?.include) return [];
    return [
      {
        kind: "versioned" as const,
        slot: policy.slot,
        assignmentId: assignment.id,
        title: assignment.title,
        ownerKind: active.ownerKind,
        policy,
      },
    ];
  });
  return mergePortfolioSlotDefinitions(legacy, versioned);
}

async function hasVersionedArtifact(
  owner: { userId: string; teamId: string | null },
  definition: Extract<PortfolioSlotDefinition, { kind: "versioned" }>,
): Promise<boolean> {
  if (definition.ownerKind === "team" && !owner.teamId) return false;
  const submissions = await prisma.submission.findMany({
    where: {
      assignmentId: definition.assignmentId,
      ...(definition.ownerKind === "team"
        ? { ownerKind: "team", ownerId: owner.teamId! }
        : { ownerKind: "individual", ownerId: owner.userId }),
      status: { in: ["graded", "finalised"] },
      assessmentResult: { scoreable: true },
      assessmentVersion: { purpose: "graded" },
    },
    select: {
      assessmentVersion: { select: { portfolioPolicy: true } },
    },
  });
  return submissions.some((submission) => {
    const policy = parsePortfolioPolicy(submission.assessmentVersion?.portfolioPolicy);
    return policy?.include === true && policy.slot === definition.slot;
  });
}

/** The §7 completeness checklist — same owner rule as the scorer. */
export async function getArtifactChecklist(userId: string): Promise<ArtifactChecklistRow[]> {
  const [user, entry, definitions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { teamId: true },
    }),
    prisma.portfolioEntry.findUnique({
      where: { userId },
      select: { links: true, lastCrawl: true },
    }),
    getPortfolioSlotDefinitions(),
  ]);
  const owner = { userId, teamId: user?.teamId ?? null };
  const externalLinks = parseExternalLinks(entry?.links);
  const lastCrawl = parseLastCrawl(entry?.lastCrawl);
  return Promise.all(
    definitions.map(async (definition) => {
      const artifactPresent =
        definition.kind === "legacy"
          ? await hasGradedArtifact(owner, definition.slug)
          : (await hasVersionedArtifact(owner, definition)) ||
            ((PORTFOLIO_REQUIRED_SLUGS as readonly string[]).includes(definition.slot) &&
              (await hasGradedArtifact(owner, definition.slot)));
      const completionState = resolveArtifactChecklistState(
        artifactPresent,
        definition.kind === "versioned" ? definition.policy : null,
        externalLinks,
        lastCrawl,
      );
      return {
        slug: definition.slot,
        title: definition.title,
        teamBased: definition.ownerKind === "team",
        present: completionState === "artifact-complete" || completionState === "complete",
        completionState,
      };
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
