import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Sign-in is the only permitted action. After it, browsing cannot make writes or AI calls.
test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
test.beforeEach(async ({ page }) => {
  await signIn(page);
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      !["GET", "HEAD"].includes(request.method()) ||
      /\/api\/.*(?:mark|transcribe|finish)/.test(
        new URL(request.url()).pathname,
      )
    ) {
      await route.abort();
      throw new Error(
        `Read-only activity spec blocked ${request.method()} ${request.url()}`,
      );
    }
    await route.continue();
  });
});

test("home study days and recent sessions link to activity", async ({
  page,
}) => {
  await expect(page.getByText("Longest streak", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Recent sessions" }),
  ).toHaveAttribute("href", "/student/activity");
  await page.getByRole("link", { name: "Open Recent sessions" }).click();
  await expect(page).toHaveURL(/\/student\/activity$/);
});

// Browsing only: no session starts, writes, marking calls or cleanup.
test.describe("Activity browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/student/activity");
    await expect(
      page.getByRole("heading", { name: "Activity", exact: true }),
    ).toBeVisible();
  });
  test("filters update the URL and show matching rows or a filtered empty state", async ({
    page,
  }) => {
    await expect(async () => {
      await page.getByRole("button", { name: /^Sprints / }).click();
      await expect(page).toHaveURL(/kind=sprint/, { timeout: 1000 });
      // Wait for the form's hidden context to commit before submitting Status.
      await expect(
        page.locator('input[type="hidden"][name="kind"]'),
      ).toHaveValue("sprint", { timeout: 1000 });
    }).toPass();
    await expect(async () => {
      await page.getByLabel("Status", { exact: true }).selectOption("progress");
      await expect(page).toHaveURL(/status=progress/, { timeout: 1000 });
    }).toPass();
    expect(new URL(page.url()).searchParams.get("kind")).toBe("sprint");
    await expect(
      page
        .getByRole("region", { name: "Your activity" })
        .or(page.getByText("No sessions match"))
        .or(page.getByText("Nothing here yet")),
    ).toBeVisible();
    const rows = page
      .getByRole("region", { name: "Your activity" })
      .getByRole("listitem");
    expect(await rows.count()).toBeLessThanOrEqual(20);
    await expect
      .poll(async () => {
        const titles = await rows.locator(".ac-title").allTextContents();
        return titles.every((t) => t.toLowerCase().includes("sprint"));
      })
      .toBe(true);
    await expect(async () => {
      await page
        .getByLabel("Search", { exact: true })
        .fill("__no_matching_session_128f__");
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(page).toHaveURL(/q=__no_matching_session_128f__/, {
        timeout: 1000,
      });
    }).toPass();
    await expect(
      page
        .getByText("No sessions match")
        .or(page.getByText("Nothing here yet")),
    ).toBeVisible();
  });
  test("sessions are grouped by day, newest first", async ({ page }) => {
    const list = page.getByRole("region", { name: "Your activity" });
    test.skip(!(await list.count()), "No existing activity");
    await expect(list.getByRole("heading").first()).toBeVisible();
    await expect(page.getByLabel("Sort", { exact: true })).toHaveValue("");
  });
  test("row title links to the existing session report", async ({ page }) => {
    await expect(async () => {
      await page.getByLabel("Status", { exact: true }).selectOption("finished");
      await expect(page).toHaveURL(/status=finished/, { timeout: 1000 });
    }).toPass();
    await expect(
      page
        .getByRole("region", { name: "Your activity" })
        .or(page.getByText("No sessions match"))
        .or(page.getByText("Nothing here yet")),
    ).toBeVisible();
    const row = page
      .getByRole("region", { name: "Your activity" })
      .locator("a.ac-cover")
      .first();
    test.skip((await row.count()) === 0, "No existing reports to view");
    const href = await row.getAttribute("href");
    expect(href).toMatch(/^\/student\/(?:flashcards\/[^/]+|activity\/[^/]+)$/);
    await row.click();
    await expect(page).toHaveURL(new URL(href!, page.url()).href);
    await expect(page.getByText("This page could not be found.")).toHaveCount(
      0,
    );
  });
  for (const width of [360, 400, 1440]) {
    test(`at ${width}px the page has no horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await expect(async () => {
        await expect(page.getByLabel("Status", { exact: true })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }).toPass();
    });
  }
  test("date, topic, sort and Clear keep URL state", async ({ page }) => {
    await expect(async () => {
      await page.getByLabel("Date", { exact: true }).selectOption("7");
      await expect(page).toHaveURL(/range=7/, { timeout: 1000 });
    }).toPass();
    const options = page
      .getByLabel("Topic", { exact: true })
      .locator('option[value]:not([value=""])');
    const topic = (await options.count())
      ? await options.first().getAttribute("value")
      : null;
    if (topic) {
      await expect(async () => {
        await page.getByLabel("Topic", { exact: true }).selectOption(topic);
        await expect(page).toHaveURL(
          new RegExp(`topic=${encodeURIComponent(topic)}`),
          { timeout: 1000 },
        );
      }).toPass();
    }
    await expect(async () => {
      await page.getByLabel("Sort", { exact: true }).selectOption("highest");
      await expect(page).toHaveURL(/sort=highest/, { timeout: 1000 });
    }).toPass();
    await page.getByRole("link", { name: /^Clear filters \(/ }).click();
    await expect(page).toHaveURL(/\/student\/activity$/);
  });
});
