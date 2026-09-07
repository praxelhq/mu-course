import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

// U16 — the definition-of-done STUDENT arc, as student001 against the seeded
// demo world: login backdoor → dashboard → sessions (session 4 locked) → the
// S3 hub with its roster-gated TrustMRR release → inspect the immutable data-memo contract
// → three gallery walls → the seven-line grades page → quiz history.
//
// Selectors favour roles and visible text so brand/CSS changes don't break
// the suite. Specs run serially (workers:1) and assume `pnpm seed` ran.

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await loginAs(context, "user_s001");
});

test("dashboard renders for student001", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("The work in front of you");
  await expect(page.getByRole("heading", { name: "Open assignments" })).toBeVisible();
  // The student nav (incl. the U16 portfolio surface) is present.
  await expect(page.getByRole("navigation", { name: "Primary" })).toContainText("Portfolio");
});

test("sessions index shows sessions 1–3 open and Session 4 locked", async ({ page }) => {
  await page.goto("/sessions");
  await expect(page.getByRole("heading", { name: "The ten sessions" })).toBeVisible();
  await expect(page.getByText("Session 3 · Open")).toBeVisible();
  await expect(page.getByText("Session 4 · Locked")).toBeVisible();
});

test("the S3 hub lists the roster-gated TrustMRR release and keeps sealed files unreleased", async ({ page }) => {
  await page.goto("/sessions/3");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("TrustMRR", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("trustmrr_s3_learner_v1.csv", { exact: false }).first()).toBeVisible();
  // The context-wall pack exists but is not yet released.
  await expect(page.getByText("Not yet released").first()).toBeVisible();
});

test("the S3 data memo exposes its frozen dataset contract and immutable receipt timeline", async ({ page }) => {
  await page.goto("/assignments/asg_s3_datamemo/submit");
  await expect(page.getByRole("heading", { name: "S3 · Verified data memo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Assessment version/ })).toBeVisible();
  await expect(page.getByText("Dataset: TrustMRR Session 3 private release v1", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version and attempt timeline" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/answer.?key|prompt.?log|confidence|holdId/i);
});

test("the galleries render three walls", async ({ page }) => {
  await page.goto("/galleries");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  // Three wall tabs (app / workflow / map) beneath the heading.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const tabs = page.locator("a[href*='wall=']");
  expect(await tabs.count()).toBeGreaterThanOrEqual(2); // active wall may render unlinked
  for (const wall of ["app", "workflow", "map"]) {
    await page.goto(`/galleries?wall=${wall}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("the grades page shows all seven component lines", async ({ page }) => {
  await page.goto("/grades");
  await expect(page.getByRole("heading", { name: "Where every point comes from" })).toBeVisible();
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(7);
  await expect(page.getByText("Current total")).toBeVisible();
});

test("the quiz history page renders the attempt record", async ({ page }) => {
  await page.goto("/quizzes");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The diagnostic never appears here; the page still renders with or
  // without countable attempts for this student.
  await expect(page.locator("main")).not.toContainText("DPDP");
});

test("the portfolio page renders the checklist and saves a narrative", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "Your portfolio" })).toBeVisible();
  await expect(page.getByText("Linked artifacts")).toBeVisible();
  await page.locator("textarea").first().fill("Portfolio narrative written from the e2e suite.");
  await page.getByRole("button", { name: "Save portfolio" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
});
