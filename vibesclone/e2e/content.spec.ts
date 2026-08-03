import { expect, test } from "@playwright/test";
import { docs, posts } from "@/lib/content";

test("docs are public, indexed, and cross-linked", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByRole("heading", { name: "Documentation" })).toBeVisible();
  for (const doc of docs) {
    await expect(page.getByRole("link", { name: new RegExp(doc.title) })).toBeVisible();
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://vibesclone.com/docs");

  await page.goto("/docs/build-sequences");
  await expect(page.getByRole("heading", { name: "Build Sequences" })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://vibesclone.com/docs/build-sequences");
  await expect(page.locator("body")).not.toContainText(/sign in to continue/i);
});

test("blog is public, newest-first, and posts carry date and author", async ({ page }) => {
  await page.goto("/blog");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://vibesclone.com/blog");
  const cardTitles = await page.locator(".content-index h2").allInnerTexts();
  expect(cardTitles).toEqual(posts.map((post) => post.title));

  const newest = posts[0];
  await page.goto(`/blog/${newest.slug}`);
  await expect(page.getByRole("heading", { name: newest.title })).toBeVisible();
  await expect(page.locator(".content-meta")).toContainText(newest.date);
  await expect(page.locator(".content-meta")).toContainText(newest.author);
});

test("sitemap lists every content route on the canonical host", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBeTruthy();
  const xml = await response.text();
  expect(xml).toContain("https://vibesclone.com/docs</loc>");
  expect(xml).toContain("https://vibesclone.com/blog</loc>");
  for (const doc of docs) {
    expect(xml).toContain(`https://vibesclone.com/docs/${doc.slug}</loc>`);
  }
  for (const post of posts) {
    expect(xml).toContain(`https://vibesclone.com/blog/${post.slug}</loc>`);
  }
});
