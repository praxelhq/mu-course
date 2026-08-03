export type DocEntry = {
  slug: string;
  title: string;
  description: string;
};

export type PostEntry = {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
};

// Ordered for the /docs index: reading order, not alphabetical.
export const docs: DocEntry[] = [
  { slug: "getting-started", title: "Getting started", description: "From a public product URL to your first Build Sequence: analyze, review, approve, and build." },
  { slug: "build-understanding", title: "The Build Understanding", description: "What the editable analysis contains, how to edit and rethink it, and why approval creates an immutable snapshot." },
  { slug: "build-sequences", title: "Build Sequences", description: "Why one base prompt plus ordered, checked follow-up prompts beats a single mega-prompt." },
  { slug: "build-targets", title: "Choosing a build target", description: "How to pick among Lovable, Replit, Base44, and Claude Code, and what platform adapters preserve." },
  { slug: "licenses-and-pricing", title: "Licenses and pricing", description: "What is free, what a project license unlocks, credit packs, the student code, and refund behavior." },
];

// Ordered for the /blog index: newest first.
export const posts: PostEntry[] = [
  { slug: "what-is-a-build-sequence", title: "What is a Build Sequence", description: "One base prompt plus ordered, checked follow-up prompts, each bound to an approved understanding: the difference between prompts and a build discipline.", date: "2026-08-03", author: "VibesClone" },
  { slug: "why-mega-prompts-fail", title: "Why mega-prompts fail", description: "The failure modes of describing an entire product in one prompt, and what verification before generation fixes about each of them.", date: "2026-07-30", author: "VibesClone" },
  { slug: "choosing-your-build-target", title: "Choosing your build target", description: "Honest guidance on Lovable, Replit, Base44, and Claude Code, and why the right answer depends on how you like to work.", date: "2026-07-27", author: "VibesClone" },
  { slug: "adapt-the-logic-not-the-identity", title: "Adapt the logic, not the identity", description: "Study what makes a product work, then build your own version for your own niche. The line between learning from a product and imitating it.", date: "2026-07-23", author: "VibesClone" },
];
