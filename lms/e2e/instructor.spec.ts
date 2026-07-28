import { expect, test } from "@playwright/test";
import { BASE, loginAs } from "./helpers";

// U16 — the instructor arc: unlock console (optimistic gate flip), the
// gate-flip LIVE-PROPAGATION demo (API-driven flip + student reload — the
// student's sealed dataset appears; poll-based waiting is flaky in CI, see
// docs/DECISIONS.md), review queue + override flow, matrix, quiz arming, and
// the CSV export endpoints.

test.describe.configure({ mode: "serial" });

test("unlock console loads and a cell flip applies optimistically", async ({ context, page }) => {
  await loginAs(context, "user_instructor");
  await page.goto("/instructor/unlocks");
  await expect(page.getByRole("heading", { name: "Unlock Console" })).toBeVisible();

  // Session 5 / Section H is locked in the seed. Click → optimistic "Open".
  const cell = page.getByRole("button", { name: /Session 5.*section H: Locked/ });
  await expect(cell).toBeVisible();
  await cell.click();
  await expect(page.getByRole("button", { name: /Session 5.*section H: Open/ })).toBeVisible();

  // Flip it back twice (open → closed → locked) to restore the seed state.
  await page.getByRole("button", { name: /Session 5.*section H: Open/ }).click();
  await expect(page.getByRole("button", { name: /Session 5.*section H: Closed/ })).toBeVisible();
  await page.getByRole("button", { name: /Session 5.*section H: Closed/ }).click();
  await expect(page.getByRole("button", { name: /Session 5.*section H: Locked/ })).toBeVisible();
});

test("gate flip propagates: the sealed S3 schema card unlocks for a section-A student", async ({
  browser,
  context,
}) => {
  await loginAs(context, "user_instructor");

  // Student view first: schema_stocks is sealed.
  const studentContext = await browser.newContext({ baseURL: BASE });
  await loginAs(studentContext, "user_s001");
  const studentPage = await studentContext.newPage();
  await studentPage.goto("/sessions/3");
  const schemaRow = studentPage.locator("li").filter({ hasText: "schema_stocks.txt" });
  await expect(schemaRow.getByText("Not yet released")).toBeVisible();

  // Instructor flips the material gate via the API (deterministic in CI —
  // the in-page 4s poll is exercised implicitly; reload asserts the result).
  const flip = (state: "open" | "locked") =>
    context.request.post(`${BASE}/api/gates/set`, {
      data: { targetType: "material", targetId: "mat_s3_schema_stocks", sectionId: "sec_A", state },
    });
  const res = await flip("open");
  expect(res.ok()).toBeTruthy();

  try {
    await studentPage.reload();
    await expect(
      studentPage.locator("li").filter({ hasText: "schema_stocks.txt" }).getByText("Not yet released"),
    ).toHaveCount(0);
  } finally {
    // Restore the seeded sealed state for repeat runs.
    await flip("locked");
    await studentContext.close();
  }
});

test("review queue lists items and the override flow opens", async ({ context, page }) => {
  await loginAs(context, "user_instructor");
  await page.goto("/instructor/review");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Queue items exist (seeded low-confidence + flagged grades).
  const finalise = page.getByRole("button", { name: "Finalise assignment" });
  expect(await finalise.count()).toBeGreaterThan(0);
  // The override flow lives behind a <details> summary per queue item.
  const overrideToggles = page.getByText("Override this grade");
  expect(await overrideToggles.count()).toBeGreaterThan(0);
  await overrideToggles.first().click();
  await expect(page.getByRole("button", { name: /Save override/ }).first()).toBeVisible();
});

test("the matrix renders", async ({ context, page }) => {
  await loginAs(context, "user_instructor");
  await page.goto("/instructor/matrix");
  await expect(page.getByRole("heading", { name: "Submission matrix" })).toBeVisible();
  await expect(page.locator("table").first()).toBeVisible();
});

test("a quiz can be armed and disarmed from the quiz console", async ({ context, page }) => {
  await loginAs(context, "user_instructor");
  await page.goto("/instructor/quizzes");
  await expect(page.getByRole("heading", { name: "Quizzes" })).toBeVisible();

  // Arm the closed Session 2 quiz for its first section, then disarm.
  const card = page.locator("section").filter({ hasText: "Session 2" }).first();
  const gateButton = card.getByRole("button", { name: /Closed|Locked/ }).first();
  await gateButton.click();
  await expect(card.getByRole("button", { name: "Live" }).first()).toBeVisible();
  await card.getByRole("button", { name: "Live" }).first().click();
  await expect(card.getByRole("button", { name: "Closed" }).first()).toBeVisible();
});

test("every CSV export endpoint responds 200", async ({ context }) => {
  await loginAs(context, "user_instructor");
  for (const path of [
    "/api/exports/grades?section=A",
    "/api/exports/peer",
    "/api/exports/interviews",
    "/api/exports/matrix?section=A",
  ]) {
    const res = await context.request.get(`${BASE}${path}`);
    expect(res.status(), path).toBe(200);
  }
});
