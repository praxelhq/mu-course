import type { ProjectStatus } from "@prisma/client";
import type { BuildUnderstanding } from "@/lib/contracts";

const transitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
  draft: ["analyzing", "deleting"],
  analyzing: ["review", "failed", "deleting"],
  review: ["analyzing", "approved", "deleting"],
  approved: ["generating", "review", "deleting"],
  generating: ["complete", "failed", "review", "deleting"],
  complete: ["review", "generating", "deleting"],
  failed: ["analyzing", "generating", "deleting"],
  deleting: [],
};

export function assertProjectTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!transitions[from].includes(to)) throw new Error(`Invalid project transition: ${from} -> ${to}`);
}

export function canGenerate(input: {
  status: ProjectStatus;
  approvedVersion: number | null;
  currentUnderstanding: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (input.approvedVersion === null) return { ok: false, reason: "Approve the Build Understanding first." };
  if (input.approvedVersion !== input.currentUnderstanding) return { ok: false, reason: "The current understanding has not been approved." };
  if (!(["approved", "complete", "failed"] as ProjectStatus[]).includes(input.status)) {
    return { ok: false, reason: "This project is not ready to generate." };
  }
  return { ok: true };
}

function brandToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sourceBrand(sourceUrl: string): string {
  try {
    const labels = new URL(sourceUrl).hostname.toLowerCase().split(".");
    const commonSubdomains = new Set(["app", "www", "get", "go", "try", "use"]);
    return commonSubdomains.has(labels[0] ?? "") ? labels[1] ?? "" : labels[0] ?? "";
  } catch {
    return "";
  }
}

export function productNameIssue(productName: string, sourceUrl: string): string | null {
  const token = brandToken(productName.trim());
  if (token.length < 2) return "Give this product a distinct working name before approval.";
  if (token === "vibesclone") return "Choose a name for the product you are building, not VibesClone.";
  const source = brandToken(sourceBrand(sourceUrl));
  if (source && (token === source || (source.length >= 4 && (token.startsWith(source) || token.endsWith(source))))) return "Choose a distinct name instead of reusing the source product's brand.";
  return null;
}

export function fallbackProductName(niche: string): string {
  const words = niche.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const stem = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ") || "New Product";
  return `${stem} Flow`;
}

export function ensureDistinctProductName(understanding: BuildUnderstanding, sourceUrl: string, niche: string): BuildUnderstanding {
  if (!productNameIssue(understanding.productName, sourceUrl)) return understanding;
  return { ...understanding, productName: fallbackProductName(niche) };
}
