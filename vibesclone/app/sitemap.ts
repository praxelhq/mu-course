import type { MetadataRoute } from "next";
import { docs, posts } from "@/lib/content";
import { blueprints } from "@/lib/blueprints";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://vibesclone.com").replace(/\/$/, "");
  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/privacy`, changeFrequency: "monthly", priority: .3 },
    { url: `${baseUrl}/terms`, changeFrequency: "monthly", priority: .3 },
    { url: `${baseUrl}/docs`, changeFrequency: "weekly", priority: .8 },
    { url: `${baseUrl}/blog`, changeFrequency: "weekly", priority: .8 },
    { url: `${baseUrl}/blueprints`, changeFrequency: "weekly", priority: .9 },
    { url: `${baseUrl}/stats`, changeFrequency: "daily", priority: .6 },
    { url: `${baseUrl}/sponsor`, changeFrequency: "monthly", priority: .5 },
    ...blueprints.map((item) => ({ url: `${baseUrl}/blueprints/${item.slug}`, changeFrequency: "monthly" as const, priority: .8 })),
    ...docs.map((doc) => ({ url: `${baseUrl}/docs/${doc.slug}`, changeFrequency: "monthly" as const, priority: .6 })),
    ...posts.map((post) => ({ url: `${baseUrl}/blog/${post.slug}`, changeFrequency: "monthly" as const, priority: .5, lastModified: post.date })),
  ];
}
