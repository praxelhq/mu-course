import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("Sessions 3–5 versioned LMS journeys", () => {
  test("student routes show exact contracts and remain private at mobile width", async ({ context, page }) => {
    await loginAs(context, "user_s001");
    await page.setViewportSize({ width: 390, height: 844 });

    for (const assignment of [
      { id: "asg_s3_datamemo", title: "S3 · Verified data memo" },
      { id: "asg_s4_app", title: "S4 · Lovable app" },
      { id: "asg_s5_workflow", title: "S5 · Revenue-supporting Make workflow" },
    ]) {
      await page.goto(`/assignments/${assignment.id}/submit`);
      await expect(page.getByRole("heading", { name: assignment.title })).toBeVisible();
      await expect(page.getByText("Frozen assessment contract")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Version and attempt timeline" })).toBeVisible();
      await expect(page.locator("main")).not.toContainText(/answer.?key|prompt.?log|confidence|holdId|reviewedFingerprint/i);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${assignment.id} must not overflow a mobile viewport`).toBeLessThanOrEqual(1);
    }
  });

  test("student assignment controls expose non-color status text", async ({ context, page }) => {
    await loginAs(context, "user_s001");
    await page.goto("/assignments/asg_s3_datamemo/submit");

    await expect(page.getByText(/Version 1|No submission receipt exists|immutable receipt/i).first()).toBeVisible();
    const publication = page.getByRole("heading", { name: "Gallery publication" });
    if (await publication.count()) {
      await expect(page.getByText(/Owner consent:/)).toBeVisible();
      await expect(page.getByText(/Instructor decision:/)).toBeVisible();
    }
  });

  test("instructor worklists expose holds, appeals, publication, and exact workflow selection", async ({ context, page }) => {
    await loginAs(context, "user_instructor");

    await page.goto("/instructor/review");
    await expect(page.getByRole("heading", { name: "Open grade holds" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open learner appeals" })).toBeVisible();

    await page.goto("/instructor/galleries");
    await expect(page.getByRole("heading", { name: "Versioned publication decisions" })).toBeVisible();
    await expect(page.getByText(/Owner consent and instructor approval are independent/i)).toBeVisible();

    await page.goto("/instructor/matrix");
    await expect(page.getByRole("heading", { name: "S5 team workflow selection" })).toBeVisible();
    await expect(page.getByText(/Learner nominations are advisory/i)).toBeVisible();
  });
});
