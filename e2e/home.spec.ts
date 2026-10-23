import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Student home", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("greeting, next step, feedback and weekly practice", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^Good (morning|afternoon|evening)/,
      }),
    ).toBeVisible();
    const next = page.locator(".home-next");
    await expect(
      next.getByRole("link", { name: /^Start sprint/ }),
    ).toHaveAttribute("href", /^\/student\/sprint/);
    await expect(
      next.getByRole("link", { name: "Flashcards" }),
    ).toHaveAttribute("href", "/student/flashcards");
    await expect(
      page.getByRole("heading", { name: "Recent feedback" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Practice days this week" }),
    ).toBeVisible();
  });

  test("S starts a sprint and / redirects home", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(async () => {
      if (!page.url().includes("/student/sprint"))
        await page.keyboard.press("s");
      await expect(page).toHaveURL(/\/student\/sprint$/, { timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await page.goto("/");
    await expect(page).toHaveURL(/\/student$/);
  });
});
