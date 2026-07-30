import { expect, test } from "@playwright/test";

test("marketing page communicates the workflow and stays usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Copy the product logic/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Analyze a product/i })).toBeVisible();
  await page.getByRole("button", { name: "Claude Code" }).click();
  await expect(page.getByText("Ordered prompts ready for Claude Code")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
