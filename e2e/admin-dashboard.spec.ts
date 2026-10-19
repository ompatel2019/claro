import { expect, test } from "@playwright/test";
import { signInAdmin } from "./helpers";

test.describe("Admin dashboard", () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Requires an admin account",
  );
  test.setTimeout(120000);

  for (const width of [390, 1280]) {
    test(`daily stats remain readable and selectable at ${width}px (A1)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await signInAdmin(page);
      for (const title of ["Sessions per day", "AI spend, last 7 days"]) {
        const card = page.locator('[data-slot="card"]').filter({
          has: page.getByRole("heading", { name: title, exact: true }),
        });
        const select = card.getByRole("combobox", { name: `${title} day` });
        await expect(select).toBeVisible();
        // Wait for the client chart to hydrate before changing its state.
        await expect
          .poll(() =>
            select.evaluate((el) =>
              Object.keys(el).some((key) => key.startsWith("__reactProps$")),
            ),
          )
          .toBe(true);
        await select.click();
        const options = page.getByRole("option");
        await expect(options).toHaveCount(7);
        const days = await options.allTextContents();
        expect(new Set(days).size).toBe(7);
        await page.keyboard.press("Escape");
        await expect(select).toHaveText(days[6]);
        const marks = card
          .locator("svg > g")
          .filter({ has: page.locator("rect, circle") });
        await expect(marks).toHaveCount(7);
        const valueForDay = async (index: number) => {
          const text = await marks.nth(index).locator("title").textContent();
          expect(text).toContain("(Sydney) · ");
          return text!.split(" · ")[1];
        };
        await expect(card.getByRole("status")).toHaveText(await valueForDay(6));
        // The kit day selector works with the keyboard, including zero days.
        await select.click();
        await page.keyboard.press("Home");
        await page.keyboard.press("Enter");
        await page.keyboard.press("Tab");
        await expect(select).toHaveText(days[0]);
        await expect(card.getByRole("status")).toHaveText(await valueForDay(0));
        // Touch/mouse users can inspect a day directly on the graph.
        await marks.nth(3).dispatchEvent("click");
        await expect(select).toHaveText(days[3]);
        await expect(card.getByRole("status")).toHaveText(await valueForDay(3));
      }
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
      "Sessions, last 7 days",
      "Open reviews",
      "Spend this month",
    ])
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText(/^vs \d+ previous 7$/)).toBeVisible();
    await expect(page.getByText(/^\$\d+\.\d\d of \$100$/)).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "All-time spend against cap" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Sessions per day, 7 Sydney days" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "AI spend, last 7 days, 7 Sydney days" }),
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
      name: "Sessions per day, 7 Sydney days",
    });
    expect((await attention.boundingBox())!.y).toBeLessThan(
      (await chart.boundingBox())!.y,
    );
    for (const link of await attention.getByRole("link").all())
      await expect(link).toHaveAttribute("href", /^\/admin\//);
    await expect(
      page.getByRole("table", { name: "Latest finished sessions" }),
    ).toHaveCount(0);
    // Each plotted day is also readable without a mouse.
    for (const title of ["Sessions per day", "AI spend, last 7 days"]) {
      await expect(
        page.getByRole("combobox", { name: `${title} day` }),
      ).toHaveValue(/\d{4}-\d{2}-\d{2}/);
    }
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
      "All students",
      "Questions",
      "Flashcards",
      "Review queue",
      "Accuracy",
      "Engine",
      "Inbox",
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
