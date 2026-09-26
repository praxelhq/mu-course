import { expect, test } from "@playwright/test";

test("marketing page communicates the workflow and stays usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Copy the product logic/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Analyze any product/i })).toBeVisible();
  await expect(page.getByLabel("Search products or paste a URL")).toBeVisible();
  await expect(page.getByLabel("A product URL becomes a verified build sequence")).toBeVisible();
  await page.getByRole("button", { name: "Claude Code" }).click();
  await page.getByRole("button", { name: /^Analyze/ }).click();
  await expect(page.getByText("Ordered prompts ready for Claude Code")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start my build" })).toBeVisible();
  await expect(page.getByText("From URL to Build Sequence.")).toBeVisible();
  await expect(page.getByText(/complete base prompt are free/i)).toBeVisible();
  await expect(page.locator("footer").getByRole("link", { name: "Docs" })).toBeVisible();
  await expect(page.locator("footer").getByRole("link", { name: "Blog" })).toBeVisible();
  const viewport = page.viewportSize();
  if (viewport && viewport.width > 760) {
    await expect(page.locator("header").getByRole("link", { name: "Docs" })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Blog" })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Masters’ Union|cohort|faculty|founder|Student results|Honest proof/i);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
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
