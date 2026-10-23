import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Student home", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("greeting, hero, study actions and study days", async ({ page }) => {
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^Good (morning|afternoon|evening)/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Your study week" }),
    ).toBeVisible();
    const quick = page.getByRole("region", { name: "Quick start" });
    for (const [name, href] of [
      ["Topic Sprint", "/student/sprint"],
      ["Flashcards", "/student/flashcards"],
    ]) {
      await expect(
        quick.getByRole("link", { name: new RegExp(`^${name}`) }),
      ).toHaveAttribute("href", href);
    }
    await expect(
      page.getByRole("heading", { name: "Study days" }),
    ).toBeVisible();
    await expect(page.getByText("Day streak")).toBeVisible();
    await expect(page.getByText("Continue where you left off")).toHaveCount(0);
    for (const name of [
      "Marks earned",
      "Questions answered",
      "Study time",
      "Cards due",
      "Practice average",
      "Today's plan",
      "Topics",
      "Where your marks go",
      "Ask Claro",
    ])
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toHaveCount(0);
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
