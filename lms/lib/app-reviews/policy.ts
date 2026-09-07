import { z } from "zod";

export const REQUIRED_APP_REVIEWS = 5;
export const APP_REVIEW_ROUND_ID = "lovable-apps-2026-08";
export const APP_REVIEW_RUBRIC_VERSION = "lovable-peer-v1";
export const APP_REVIEW_INSTRUCTION = "You must complete all 5 peer reviews to receive your own app grade.";
export const APP_REVIEW_RUBRIC = [
  { key: "visual", label: "Visual bar", anchors: {
    1: "Hard to read or navigate: overlapping content, inconsistent spacing, low contrast, or an unusable mobile layout.",
    3: "Clear, usable layout with readable text and consistent navigation. Some spacing, hierarchy, or mobile details need refinement.",
    5: "Polished and coherent: strong hierarchy, readable contrast, consistent components, and layouts that work well on desktop and mobile.",
  } },
  { key: "functionality", label: "Functionality", anchors: {
    1: "The main task cannot be completed: core controls fail, results are missing, or the app is only a static mock-up.",
    3: "The main user flow works end to end with sensible input and output; secondary features or error handling have gaps.",
    5: "Core and supporting flows work reliably. Inputs are validated, state behaves correctly, and empty/error cases give useful feedback.",
  } },
  { key: "overall", label: "Overall (complexity + working)", anchors: {
    1: "Little working product beyond a landing page or template; the promised user problem is not solved.",
    3: "A useful, scoped product solves a clear problem through a working multi-step flow. Some depth or reliability is missing.",
    5: "A complete, purposeful product combines meaningful interacting features into a reliable end-to-end solution. Complexity earns credit only when it works.",
  } },
] as const;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}
export const commentSchema = z.string().trim().max(5000).transform((text) => text.replace(/\s+/gu, " ")).refine((text) => wordCount(text) >= 20, "Write at least 20 words describing what you tested, what worked, and what to improve.");
export const reviewSchema = z.object({
  visual: z.number().int().min(1).max(5),
  functionality: z.number().int().min(1).max(5),
  overall: z.number().int().min(1).max(5),
  comment: commentSchema,
}).strict();

// No server fetch is performed. Reviewers open public app links in a separate
// no-referrer tab. Document/editor links and private-network hosts are refused.
export function normalizeAppUrl(raw: string): string {
  const url = new URL(raw.trim());
  const host = url.hostname.toLowerCase();
  const blocked = ["docs.google.com", "drive.google.com", "lovable.dev", "claude.ai", "stitch.withgoogle.com", "aistudio.google.com"];
  if (url.protocol !== "https:" || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u.test(host)
    || /\.(?:local|localhost|internal|lan|test|invalid|example)$/u.test(host)
    || host === "localhost" || blocked.some((domain) => host === domain || host.endsWith(`.${domain}`))
    || url.username || url.password || url.port) {
    throw new Error("Use a public HTTPS hosted app link, not a document, editor link, login credential, IP address, or private-network address.");
  }
  // Tracking data may identify a student; an app that requires other query
  // values needs instructor correction rather than silently changing its URL.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|tracking|fbclid|gclid)$/iu.test(key)) url.searchParams.delete(key);
  }
  if (url.search) throw new Error("Remove query parameters containing identifiers, credentials, or private sharing tokens before importing.");
  if (url.hash) throw new Error("Use the public app entry URL without a fragment; do not silently remove app routes or sharing tokens.");
  return url.toString();
}

type Candidate = { id: string; authorId: string; sectionId: string; appUrl: string; load: number };
export function chooseAppReviews<T extends Candidate>(entries: T[], reviewer: { userId: string; sectionId: string }, previous: Pick<Candidate, "id" | "authorId" | "appUrl">[], count = REQUIRED_APP_REVIEWS - previous.length): T[] {
  const seenIds = new Set(previous.map((entry) => entry.id));
  const seenAuthors = new Set([reviewer.userId, ...previous.map((entry) => entry.authorId)]);
  const seenUrls = new Set([...previous.map((entry) => entry.appUrl), ...entries.filter((entry) => entry.authorId === reviewer.userId).map((entry) => entry.appUrl)]);
  const chosen: T[] = [];
  for (const entry of [...entries].sort((a, b) => a.load - b.load || a.id.localeCompare(b.id))) {
    if (chosen.length >= count) break;
    if (entry.sectionId !== reviewer.sectionId || seenIds.has(entry.id) || seenAuthors.has(entry.authorId) || seenUrls.has(entry.appUrl)) continue;
    chosen.push(entry);
    seenAuthors.add(entry.authorId);
    seenUrls.add(entry.appUrl);
  }
  return chosen;
}

export type StudentAppReview = {
  id: string; slot: number; appUrl: string; visual: number | null;
  functionality: number | null; overall: number | null; comment: string;
  completedAt: string | null; accessIssue: string | null;
};
