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
export const posts: PostEntry[] = [];
