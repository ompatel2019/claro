import { expect, test } from "@playwright/test";
import { signIn, signInAdminRedirect } from "./helpers";

test.describe("Homework is removed", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.ADMIN_EMAIL,
    "Requires student and admin accounts",
  );
  test("student homework routes 404 and the nav has no homework", async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.getByRole("link", { name: /homework/i })).toHaveCount(0);
    for (const path of ["/homework", "/homework/x", "/homework/x/do"])
      expect((await page.goto(path))?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
    expect(
      await page
        .getByText("Page not found")
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).toMatch(/claroSans/);
  });
  test("admin homework routes 404", async ({ page }) => {
    await signInAdminRedirect(page, false);
    for (const path of ["/admin/homework", "/admin/homework/x"])
      expect((await page.goto(path))?.status()).toBe(404);
  });
});
