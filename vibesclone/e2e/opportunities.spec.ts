import { expect, test } from "@playwright/test";
import { opportunities } from "@/lib/opportunities";

test("earning-product list filters and links to an evidence page with a qualified build", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page.getByRole("heading", { level: 1, name: "Products that already earn" })).toBeVisible();
  const table = page.getByRole("region", { name: "Earning products" });
  await expect(table.getByRole("row")).toHaveCount(opportunities.length + 1);
  const first = opportunities[0];
  await page.getByLabel("Search earning products").fill(first.name);
  await expect(table.getByRole("link", { name: first.name }).first()).toBeVisible();
  await table.getByRole("link", { name: first.name }).first().click();
  await expect(page).toHaveURL(new RegExp(`/opportunities/${first.slug}$`));
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`${first.name} earns`) })).toBeVisible();
  await expect(page.getByText("Revenue verified by TrustMRR")).toBeVisible();
  await expect(page.getByRole("link", { name: /View the TrustMRR listing/ })).toHaveAttribute("href", first.trustmrrUrl);
  await expect(page.getByRole("link", { name: `Analyze ${first.name}` })).toHaveAttribute("href", new RegExp(`/workspace\\?sourceUrl=.*origin=opportunity%3A${first.slug}`));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://vibesclone.com/opportunities/${first.slug}`);
});

test("category deep links pre-filter the list", async ({ page }) => {
  const category = opportunities[0].category;
  await page.goto(`/opportunities?category=${encodeURIComponent(category)}`);
  const expected = opportunities.filter((item) => item.category === category).length;
  await expect(page.getByRole("region", { name: "Earning products" }).getByRole("row")).toHaveCount(expected + 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
