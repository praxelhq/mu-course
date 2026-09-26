import { expect, test } from "@playwright/test";

test("marketing page leads with verified revenue and stays usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Build what’s already earning/i })).toBeVisible();
  await expect(page.getByLabel("Search earning products or paste a product URL")).toBeVisible();
  await expect(page.getByRole("region", { name: "Earning products" })).toBeVisible();
  await expect(page.getByRole("link", { name: /See all \d+ earning products/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Buy the business, or build your version/i })).toBeVisible();
  await page.getByRole("button", { name: "Claude Code" }).click();
  await page.getByRole("button", { name: /^Analyze/ }).click();
  await expect(page.getByText("Ordered prompts ready for Claude Code")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start my build" })).toBeVisible();
  await expect(page.getByText(/complete base prompt are free/i)).toBeVisible();
  await expect(page.locator("footer").getByRole("link", { name: "Docs" })).toBeVisible();
  await expect(page.locator("footer").getByRole("link", { name: "Blog" })).toBeVisible();
  const viewport = page.viewportSize();
  if (viewport && viewport.width > 760) {
    await expect(page.locator("header").getByRole("link", { name: "Docs" })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Opportunities" })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
  // No course, cohort, or proof-placeholder copy, and no promises about VibesClone's own founder.
  // (Third-party founder-audience data is part of the evidence and is allowed.)
  await expect(page.locator("body")).not.toContainText(/Masters’ Union|cohort|faculty|instructor|Student results|Honest proof|directly to the founder|our founder/i);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("hero search routes names to their page and free text to the filtered list", async ({ page }) => {
  await page.goto("/");
  const search = page.getByLabel("Search earning products or paste a product URL");
  await search.fill("Linear");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/blueprints\/linear$/);
  await page.goto("/");
  await search.fill("seo");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/opportunities\?q=seo$/);
  await expect(page.getByLabel("Search earning products")).toHaveValue("seo");
});

test("metadata and legal routes are launch-ready", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://vibesclone.com");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await page.getByRole("link", { name: "Back to VibesClone" }).click();
  await expect(page).toHaveURL("/");
});
