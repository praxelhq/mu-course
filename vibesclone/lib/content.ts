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
export const docs: DocEntry[] = [];

// Ordered for the /blog index: newest first.
export const posts: PostEntry[] = [];
