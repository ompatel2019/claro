import { expect, test } from "@playwright/test";
import { cleanupSessions, pick, signIn, start } from "./helpers";
for (const width of [390, 1440]) {
  test.describe(`Sprint check ${width}px`, () => {
    test.skip(!process.env.STUDENT_EMAIL, "Needs a synthetic student account");
    const ids: string[] = [];
    test.afterAll(async () => cleanupSessions(ids));
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page);
    });
    test("unchecked hint on hover/focus highlights Check and never blocks Next", async ({
      page,
    }) => {
      await start(page, "Multiple choice", ids, true);
      const next = page.getByRole("button", { name: "Next question" });
      await next.focus();
      await expect(page.getByRole("tooltip")).toBeHidden();
      await pick(page, "A");
      const check = page.getByRole("button", { name: "Check answer" });
      await expect(check).toHaveAttribute(
        "aria-description",
        "You have an unchecked answer.",
      );
      await expect(check).toHaveClass(/ring-2/);
      if (width > 1000) await next.hover();
      else await next.focus();
      await expect(page.getByRole("tooltip")).toContainText("check it first?");
      await next.click();
      await expect(page.getByText(/^Question 2 ·/)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Check answer" }),
      ).toBeDisabled();
      await expect(page.getByRole("tooltip")).toBeHidden();
    });
    test("a check error keeps the reminder; a successful retry clears it", async ({
      page,
    }) => {
      let error = true;
      await page.route("**/api/attempts/*/mark", (route) =>
        route.fulfill({
          status: error ? 503 : 200,
          contentType: "application/json",
          body: JSON.stringify(
            error
              ? { error: "Marking is paused. Try again." }
              : {
                  status: "marked",
                  mark: 1,
                  max_marks: 1,
                  feedback: { correct_index: 0 },
                  explanation: "Synthetic feedback.",
                },
          ),
        }),
      );
      await start(page, "Multiple choice", ids, true);
      await pick(page, "A");
      const check = page.getByRole("button", { name: "Check answer" });
      await check.click();
      await expect(page.getByRole("alert")).toContainText("Marking is paused.");
      await expect(check).toHaveAttribute(
        "aria-description",
        "You have an unchecked answer.",
      );
      error = false;
      await check.click();
      await expect(page.getByText("Correct", { exact: true })).toBeVisible();
      await expect(check).toHaveCount(0);
      await page.getByRole("button", { name: "Next question" }).focus();
      await expect(page.getByRole("tooltip")).toBeHidden();
    });
    test("exam feedback mode never prompts to check", async ({ page }) => {
      await start(page, "Multiple choice", ids);
      await pick(page, "A");
      await page.getByRole("button", { name: "Next question" }).focus();
      await expect(page.getByRole("tooltip")).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Check answer" }),
      ).toHaveCount(0);
    });
  });
}
