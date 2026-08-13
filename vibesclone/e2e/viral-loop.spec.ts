import { expect, test } from "@playwright/test";
import { blueprints } from "@/lib/blueprints";

test("public blueprint utility resolves a known product and exposes a qualified remix", async ({ page }) => {
  await page.goto("/blueprints");
  await expect(page.getByRole("heading", { name: /Find the buildable core/i })).toBeVisible();
  await page.getByLabel("Search products or paste a URL").fill("Linear");
  await page.getByRole("button", { name: "Explore" }).click();
  await expect(page).toHaveURL(/\/blueprints\/linear$/);
  await expect(page.getByRole("heading", { name: /Build a Linear alternative/i })).toBeVisible();
  await expect(page.getByText("78/100").first()).toBeVisible();
  const build = page.getByRole("link", { name: "Build your version" }).first();
  await expect(build).toHaveAttribute("href", /\/workspace\?sourceUrl=.*linear\.app.*origin=blueprint%3Alinear/);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(3);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://vibesclone.com/blueprints/linear");
  await expect(page.getByRole("button", { name: "Copy free prompt" })).toBeVisible();
});

test("blueprint library is substantive and responsive", async ({ page }) => {
  await page.goto("/blueprints");
  for (const blueprint of blueprints) await expect(page.getByRole("link", { name: new RegExp(blueprint.name) }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/OpenRouter|Qwen|student|cohort|sold out|guaranteed traffic/i);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("digest capture reports success without inventing proof", async ({ page }) => {
  await page.route("**/api/newsletter", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ subscribed: true, confirmation: "sent" }) }));
  await page.goto("/blueprints/linear");
  await page.getByPlaceholder("you@company.com").fill("builder@example.com");
  await page.getByRole("button", { name: "Get the digest" }).click();
  await expect(page.getByText("You’re in. Check your inbox for confirmation.")).toBeVisible();
});

test("digest capture recovers from a non-JSON server failure", async ({ page }) => {
  await page.route("**/api/newsletter", async (route) => route.fulfill({ status: 503, contentType: "text/html", body: "temporarily unavailable" }));
  await page.goto("/blueprints/linear");
  await page.getByPlaceholder("you@company.com").fill("builder@example.com");
  await page.getByRole("button", { name: "Get the digest" }).click();
  await expect(page.getByText("Could not subscribe.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Get the digest" })).toBeEnabled();
});

test("partner page asks for interest without pretending inventory exists", async ({ page }) => {
  await page.goto("/sponsor");
  await expect(page.getByRole("heading", { name: /Reach builders while they are choosing the stack/i })).toBeVisible();
  await expect(page.getByText("No inventory theatre.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join the partner list" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/buy now|sold out|guaranteed impressions/i);
});
