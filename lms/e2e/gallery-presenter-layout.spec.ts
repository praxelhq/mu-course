import { expect, test } from "@playwright/test";

test("keeps the real large projector gallery inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/layout-test/gallery-projector");
  await page.getByRole("button", { name: /Present gallery/ }).click();

  const selectors = [
    "projector-actions",
    "projector-main-image",
    "projector-footer",
    "projector-thumbnail-rail",
  ];
  for (const testId of selectors) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box, `${testId} should be rendered`).not.toBeNull();
    expect(box!.x, `${testId} left edge`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${testId} right edge`).toBeLessThanOrEqual(1280);
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  }

  const next = await page.getByRole("button", { name: "Next image" }).boundingBox();
  expect(next).not.toBeNull();
  expect(next!.x + next!.width).toBeLessThanOrEqual(1280);

  const rail = page.getByTestId("projector-thumbnail-rail");
  const overflow = await rail.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  await expect(page.getByRole("heading", { name: "S2 · Meme" })).toHaveCSS(
    "color",
    "rgb(245, 240, 232)",
  );
});
