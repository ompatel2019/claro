import { expect, test } from "@playwright/test";
import { signInAdmin } from "./helpers";

test.describe("Admin dashboard", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires an admin account",
  );
  test.setTimeout(120000);

  for (const width of [390, 1280]) {
    test(`one 14-day sessions chart with no day picker at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await signInAdmin(page);
      const card = page.locator('[data-slot="card"]').filter({
        has: page.getByRole("heading", {
          name: "Sessions per day",
          exact: true,
        }),
      });
      await expect(card).toBeVisible({ timeout: 60000 });
      await expect(card.getByRole("combobox")).toHaveCount(0);
      await expect(
        card.locator("svg > g").filter({ has: page.locator("circle") }),
      ).toHaveCount(14);
      await expect(
        page.getByRole("heading", { name: "AI spend, last 7 days" }),
      ).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    });
  }

  test("KPIs, charts, needs attention and the latest sessions", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible({ timeout: 60000 });
    for (const label of [
      "Active students, 7 days",
      "Sessions, 7 days",
      "Open reviews",
      "Spend this month",
    ])
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(
      page.getByText(/^vs \d+ the week before$/).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/^Month to date · \$\d+\.\d\d of \$100 cap$/),
    ).toBeVisible();
    await expect(
      page.getByRole("progressbar", {
        name: "Spend this month against the cap",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Sessions per day, 14 Sydney days" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Needs attention" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recent sessions" }),
    ).toBeVisible();
    const list = page.getByRole("list", { name: "Recent sessions" });
    const empty = page.getByText(
      /^(No students yet|No finished sessions yet)$/,
    );
    await expect(list.or(empty)).toBeVisible();
    if (await list.isVisible()) {
      expect(await list.getByRole("listitem").count()).toBeLessThanOrEqual(3);
      await expect(list.getByRole("link").first()).toHaveAttribute(
        "href",
        /^\/admin\/students\/[0-9a-f-]{36}\?tab=sessions&session=[0-9a-f-]{36}$/,
      );
    }
    const attention = page
      .getByRole("heading", { name: "Needs attention" })
      .locator('xpath=ancestor::*[@data-slot="card"]');
    const chart = page.getByRole("img", {
      name: "Sessions per day, 14 Sydney days",
    });
    expect((await attention.boundingBox())!.y).toBeLessThan(
      (await chart.boundingBox())!.y,
    );
    for (const link of await attention.getByRole("link").all())
      await expect(link).toHaveAttribute("href", /^\/admin\//);
    await expect(
      page.getByRole("table", { name: "Latest finished sessions" }),
    ).toHaveCount(0);
    // Sidebar follows the §1 admin navigation.
    const nav = page.getByRole("navigation", { name: "Admin navigation" });
    await expect(
      nav.getByRole("link", { name: "Papers", exact: true }),
    ).toHaveCount(0);
    await expect(nav.locator('a[href^="/admin/content/papers"]')).toHaveCount(
      0,
    );
    for (const name of [
      "Dashboard",
      "Students",
      "Feedback",
      "Questions",
      "Flashcards",
      "Review queue",
      "Marking quality",
      "AI spend",
    ])
      await expect(nav.getByRole("link", { name })).toBeVisible();
  });
  test("dashboard fits narrow screens", async ({ page }) => {
    await signInAdmin(page);
    for (const width of [360, 390, 400]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/admin");
      await expect(
        page.getByRole("heading", { name: "Needs attention" }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    }
  });
});
