import { z } from "zod";
import { createHash } from "node:crypto";
import { scanSensitiveText } from "./evidence/sensitive-data";

export type PublicationActionPolicy =
  | {
      label: string;
      field: string;
      kind: "external-url";
      allowedHosts: string[];
      requireReviewedFingerprint?: boolean;
      urlKind?: "generic" | "make-scenario";
    }
  | {
      label: string;
      role: string;
      kind: "roster-file";
    };

export type PublicationPolicy = {
  wall: "app" | "workflow" | "maps";
  consentField: string;
  captionField: string;
  publicTextFields: string[];
  previewRole: string;
  actions: PublicationActionPolicy[];
};

const forbiddenProjectionKey =
  /(answer.?key|blueprint|confidence|credential|evaluator|grade|prompt|raw.?log|run.?log|score|secret|token|trust.?mrr)/i;

const safeFieldKey = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => !forbiddenProjectionKey.test(value), "private field cannot be projected");

const safeFileRole = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => !forbiddenProjectionKey.test(value), "private file role cannot be projected");

type AllowedHostRule = { kind: "exact" | "subdomains"; domain: string };

const domainPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function parseAllowedHostRule(value: string): AllowedHostRule | null {
  const raw = value.trim().toLocaleLowerCase("en-US");
  const subdomains = raw.startsWith("*.") || raw.startsWith(".");
  const domain = raw.startsWith("*.") ? raw.slice(2) : raw.startsWith(".") ? raw.slice(1) : raw;
  if (!domainPattern.test(domain)) return null;
  return { kind: subdomains ? "subdomains" : "exact", domain };
}

const allowedHostRule = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => parseAllowedHostRule(value) !== null, "invalid host allowlist rule");

const actionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      label: z.string().min(1).max(80),
      field: safeFieldKey,
      kind: z.literal("external-url"),
      allowedHosts: z.array(allowedHostRule).min(1).max(20),
      requireReviewedFingerprint: z.boolean().optional(),
      urlKind: z.enum(["generic", "make-scenario"]).optional(),
    })
    .strict(),
  z
    .object({
      label: z.string().min(1).max(80),
      role: safeFileRole,
      kind: z.literal("roster-file"),
    })
    .strict(),
]);

export const publicationPolicySchema = z
  .object({
    wall: z.enum(["app", "workflow", "maps"]),
    consentField: safeFieldKey,
    captionField: safeFieldKey,
    publicTextFields: z.array(safeFieldKey).max(20),
    previewRole: safeFileRole,
    actions: z.array(actionSchema).max(10),
  })
  .strict()
  .superRefine((policy, ctx) => {
    for (const [index, action] of policy.actions.entries()) {
      if (action.kind !== "external-url" || action.urlKind !== "make-scenario") continue;
      if (
        !action.allowedHosts.every((host) => {
          const rule = parseAllowedHostRule(host);
          return Boolean(
            rule &&
              (rule.domain === "make.com" || rule.domain.endsWith(".make.com")),
          );
        })
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["actions", index, "allowedHosts"],
          message: "Make scenario actions may only allow official make.com hosts",
        });
      }
    }
  });

/** Strict/fail-closed parser shared by the loader and every projection. */
export function parsePublicationPolicy(value: unknown): PublicationPolicy | null {
  const parsed = publicationPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

type FingerprintEvidence = {
  role: string;
  sha256: string;
  s3VersionId: string;
  byteCount: number;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

/**
 * Fingerprints only the explicit publication surface. Hidden submission keys
 * never influence (or enter) the digest input, while a changed preview,
 * sample-output receipt, caption, or action URL invalidates the review.
 */
export function fingerprintPublicationSource(args: {
  policy: PublicationPolicy;
  fields: Record<string, unknown>;
  evidence: FingerprintEvidence[];
  previewRef: string | null;
}): string {
  const fieldKeys = new Set([
    args.policy.captionField,
    ...args.policy.publicTextFields,
    ...args.policy.actions.flatMap((action) =>
      action.kind === "external-url" ? [action.field] : [],
    ),
  ]);
  const fields = Object.fromEntries(
    [...fieldKeys]
      .sort((a, b) => a.localeCompare(b))
      .flatMap((key) => {
        const value = args.fields[key];
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? [[key, value] as const]
          : [];
      }),
  );
  const roles = new Set([
    args.policy.previewRole,
    ...args.policy.actions.flatMap((action) =>
      action.kind === "roster-file" ? [action.role] : [],
    ),
  ]);
  const evidence = args.evidence
    .filter((item) => roles.has(item.role))
    .map((item) => ({
      role: item.role,
      sha256: item.sha256,
      s3VersionId: item.s3VersionId,
      byteCount: item.byteCount,
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.sha256.localeCompare(b.sha256));
  const payload = canonicalize({
    policy: args.policy,
    fields,
    evidence,
    previewRef: args.previewRef,
  });
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

export type PublicationEvidence = {
  role: string;
  publicUrl: string | null;
  state: "pending" | "clean" | "quarantined" | "replaced";
};

export type PublicationProjection =
  | { published: false; withheldReasons: string[] }
  | {
      published: true;
      wall: PublicationPolicy["wall"];
      text: Record<string, string>;
      caption: string | null;
      previewUrl: string;
      actions: { label: string; kind: "external-url" | "roster-file"; target: string }[];
    };

function allowedExternalUrl(
  raw: unknown,
  allowedHosts: string[],
  urlKind: "generic" | "make-scenario" = "generic",
): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLocaleLowerCase("en-US");
    const allowed = allowedHosts.some((value) => {
      const rule = parseAllowedHostRule(value);
      if (!rule) return false;
      if (rule.kind === "exact") return host === rule.domain;
      // The leading dot is part of the match, so `evillovable.app` and
      // `foo.lovable.app.evil.example` cannot satisfy `.lovable.app`.
      return host.endsWith(`.${rule.domain}`);
    });
    if (!allowed) return null;
    for (const key of parsed.searchParams.keys()) {
      if (/(auth|credential|key|password|secret|token|webhook)/i.test(key)) return null;
    }
    const decodedUrlSurface = [parsed.pathname, parsed.search.slice(1), parsed.hash.slice(1)]
      .map((value) => {
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      })
      .join("\n");
    if (
      scanSensitiveText(decodedUrlSurface, "publication-url").some(
        (finding) => finding.detector === "secret-token" || finding.detector === "sensitive-key",
      )
    ) return null;
    if (urlKind === "make-scenario") {
      if (!(host === "make.com" || host.endsWith(".make.com"))) return null;
      if (!/(?:^|\/)(?:public\/)?(?:shared-)?scenario(?:\/|$)/i.test(parsed.pathname)) return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Pure allowlist projection. Callers must perform network safety checks and
 * evidence authorization before providing the current fingerprint/URLs.
 */
export function projectPublication(args: {
  policy: PublicationPolicy;
  fields: Record<string, unknown>;
  evidence: PublicationEvidence[];
  consent: { active: boolean };
  curation: { status: "pending" | "approved" | "withheld" | "revoked" };
  reviewedFingerprints: Record<string, string | undefined>;
  currentFingerprints: Record<string, string | undefined>;
}): PublicationProjection {
  if (!args.consent.active) {
    return { published: false, withheldReasons: ["owner-consent-required"] };
  }
  if (args.curation.status !== "approved") {
    return { published: false, withheldReasons: ["instructor-approval-required"] };
  }

  const preview = args.evidence.find((item) => item.role === args.policy.previewRole);
  if (!preview || preview.state !== "clean" || !preview.publicUrl) {
    return { published: false, withheldReasons: ["preview-not-clean"] };
  }

  const publicValues = [
    ...args.policy.publicTextFields.map((key) => ({ key, value: args.fields[key] })),
    { key: args.policy.captionField, value: args.fields[args.policy.captionField] },
  ];
  for (const item of publicValues) {
    if (typeof item.value !== "string") continue;
    if (
      /(?:trust\s*mrr|\bmrr\b|monthly.?recurring.?revenue|product.?id|revenue.?30d|startup.?id)/i.test(
        item.value,
      ) ||
      scanSensitiveText(item.value, `publication:${item.key}`).length > 0
    ) {
      return { published: false, withheldReasons: ["public-text-unsafe"] };
    }
  }

  const text: Record<string, string> = {};
  for (const key of args.policy.publicTextFields) {
    const value = args.fields[key];
    if (typeof value === "string" && value.trim()) text[key] = value.trim();
  }

  const actions: Extract<PublicationProjection, { published: true }>["actions"] = [];
  for (const action of args.policy.actions) {
    if (action.kind === "external-url") {
      const target = allowedExternalUrl(
        args.fields[action.field],
        action.allowedHosts,
        action.urlKind,
      );
      if (!target) continue;
      if (action.requireReviewedFingerprint) {
        const reviewed = args.reviewedFingerprints[action.field];
        const current = args.currentFingerprints[action.field];
        if (!reviewed || !current || reviewed !== current) continue;
      }
      actions.push({ label: action.label, kind: action.kind, target });
      continue;
    }

    const file = args.evidence.find((item) => item.role === action.role);
    if (file?.state === "clean" && file.publicUrl) {
      actions.push({ label: action.label, kind: action.kind, target: file.publicUrl });
    }
  }

  const caption = args.fields[args.policy.captionField];
  return {
    published: true,
    wall: args.policy.wall,
    text,
    caption: typeof caption === "string" && caption.trim() ? caption.trim() : null,
    previewUrl: preview.publicUrl,
    actions,
  };
}
