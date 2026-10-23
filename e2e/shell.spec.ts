import { expect, test, type Page } from "@playwright/test";
import { signIn, signInAdmin } from "./helpers";

const sidebarWidth = (page: Page) =>
  page
    .locator('[data-slot="sidebar-container"]')
    .evaluate((el) => el.getBoundingClientRect().width);

test.describe("App shell", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Requires a real student account",
  );
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies({ name: "sidebar_state" });
    await signIn(page);
  });

  test("sidebar collapses to icons with tooltips, toggles with ⌘B and remembers", async ({
    page,
  }) => {
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect.poll(() => sidebarWidth(page)).toBe(248);
    await expect(async () => {
      if ((await sidebarWidth(page)) !== 72)
        await page
          .locator('[data-slot="sidebar-header"]')
          .getByRole("button", { name: "Toggle Sidebar" })
          .click();
      await expect.poll(() => sidebarWidth(page), { timeout: 1500 }).toBe(72);
    }).toPass({ timeout: 15000 });
    await nav.getByRole("link", { name: "Flashcards" }).hover();
    await expect(
      page.locator('[data-slot="tooltip-content"]', { hasText: "Flashcards" }),
    ).toBeVisible();
    await page.reload();
    await expect.poll(() => sidebarWidth(page)).toBe(72);
    await expect(async () => {
      if ((await sidebarWidth(page)) !== 248)
        await page.locator("body").press("ControlOrMeta+b");
      await expect.poll(() => sidebarWidth(page), { timeout: 1500 }).toBe(248);
    }).toPass({ timeout: 15000 });
    await nav.getByRole("link", { name: "Activity" }).click();
    await expect(page).toHaveURL(/\/student\/activity$/);
    await expect(nav.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("Only the kit UI and accent fonts are used", async ({ page }) => {
    const families = await page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll("body, body *")]
          .filter((el) => !el.closest("nextjs-portal")) // dev-only overlay
          .map((el) => getComputedStyle(el).fontFamily),
      ),
    ]);
    expect(families.length).toBeGreaterThan(0);
    for (const family of families)
      expect(family).toMatch(/claroSans|instrumentSerif|caveat/);
    const italic = await page.evaluate(
      () =>
        [...document.querySelectorAll("body *")].filter(
          (el) => getComputedStyle(el).fontStyle === "italic",
        ).length,
    );
    expect(italic).toBe(0);
    const html = await page.content();
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  test("mobile opens the sidebar as a sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-slot="sidebar-container"]')).toHaveCount(
      0,
    );
    await expect(async () => {
      if (
        !(await page
          .getByRole("navigation", { name: "Main navigation" })
          .isVisible())
      )
        await page.getByRole("button", { name: "More navigation" }).click();
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15000 });
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(
      nav.getByRole("button", { name: "Send feedback", exact: true }),
    ).toBeVisible();
    await nav.getByRole("link", { name: "Topic Sprint" }).click();
    const tabs = page.getByRole("navigation", { name: "Phone navigation" });
    await expect(tabs.getByRole("link")).toHaveText([
      "Home",
      "Sprint",
      "Progress",
      "Feedback",
    ]);
    await expect(tabs.getByRole("link", { name: "Feedback" })).toHaveAttribute(
      "href",
      "/student/activity?status=finished",
    );
    await expect(page).toHaveURL(/\/student\/sprint$/);
  });
});

test.describe("Admin shell", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires an admin account",
  );
  test("admin sidebar is grouped and separate from the student nav", async ({
    page,
  }) => {
    await page.context().clearCookies({ name: "sidebar_state" });
    await signInAdmin(page);
    const nav = page.getByRole("navigation", { name: "Admin navigation" });
    await expect(
      nav.getByRole("link", { name: "Papers", exact: true }),
    ).toHaveCount(0);
    await expect(nav.locator('a[href^="/admin/content/papers"]')).toHaveCount(
      0,
    );
    for (const group of [
      "Overview",
      "Students",
      "Content",
      "Marking",
      "Feedback",
      "Spend",
    ])
      await expect(nav.getByText(group, { exact: true })).toBeVisible();
    await expect(nav.getByRole("link")).toHaveText([
      "Dashboard",
      "All students",
      "Questions",
      "Flashcards",
      "Review queue",
      "Accuracy",
      "Engine",
      "Inbox",
      "AI spend",
    ]);
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Open student app" }),
    ).toHaveAttribute("href", "/student");
    await page.getByRole("link", { name: "Open student app" }).click();
    await expect(page).toHaveURL(/\/student$/);
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await page.goto("/admin");
    await nav.getByRole("link", { name: "AI spend" }).click();
    await expect(page.getByRole("heading", { name: "AI spend" })).toBeVisible();
  });
});
