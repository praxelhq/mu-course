import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { docs, posts } from "@/lib/content";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../app");

function routeDirs(segment: string): string[] {
  try {
    return readdirSync(path.join(appDir, segment), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

describe("content registry", () => {
  it("keeps docs entries and app/docs route directories in parity", () => {
    expect([...docs.map((doc) => doc.slug)].sort()).toEqual(routeDirs("docs"));
  });

  it("keeps post entries and app/blog route directories in parity", () => {
    expect([...posts.map((post) => post.slug)].sort()).toEqual(routeDirs("blog"));
  });

  it("uses unique slugs across the registry", () => {
    const slugs = [...docs.map((doc) => doc.slug), ...posts.map((post) => post.slug)];
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("orders posts newest-first with valid ISO dates", () => {
    for (const post of posts) {
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(post.date))).toBe(false);
    }
    const dates = posts.map((post) => Date.parse(post.date));
    const sorted = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sorted);
  });
});
