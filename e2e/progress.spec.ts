import { expect, test } from "./fixtures/weak-topic-student";
import { adminClient } from "./helpers";

test.describe("Student progress (read only)", () => {
  test.skip(!adminClient(), "Needs Supabase test credentials");
  test.beforeEach(async ({ page, historyStudent }) => {
    await historyStudent.addAnswers(3);
    await historyStudent.addAnswers(1);
    await page.goto("/student/progress");
    await expect(
      page.getByRole("heading", { level: 1, name: "Progress" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Marks by topic", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("progress-stats")).toHaveCount(0);
    await expect(page.getByTestId("activity-heatmap")).toHaveCount(0);
    await expect(
      page.getByRole("radiogroup", { name: "Progress range" }),
    ).toBeVisible();
  });
  test("range changes the URL and the card snapshot", async ({ page }) => {
    for (const [value, label] of [
      ["7", "7 days"],
      ["30", "30 days"],
      ["year", "This year"],
      ["all", "All time"],
      ["90", "90 days"],
    ]) {
      const control = page.getByRole("radio", { name: label, exact: true });
      await expect(async () => {
        if (new URL(page.url()).searchParams.get("range") !== value)
          await control.click();
        await expect(page).toHaveURL(new RegExp(`[?&]range=${value}(?:&|$)`), {
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
      // URL changes can precede the streamed cards and transition completion.
      await expect(page.getByTestId("progress-page")).toHaveAttribute(
        "data-range",
        value,
      );
      await expect(control).toHaveAttribute("aria-checked", "true");
    }
  });
  test("practice and review links open existing setups without starting work", async ({
    page,
  }) => {
    await page.goto("/student/progress?range=all");
    await expect(page.getByTestId("progress-page")).toHaveAttribute(
      "data-range",
      "all",
    );
    const practice = page
      .getByRole("table", { name: "Marks by topic", exact: true })
      .getByRole("link", { name: /^Practise / });
    await expect(practice.first()).toBeVisible();
    for (const link of await practice.all()) {
      const target = new URL((await link.getAttribute("href"))!, page.url());
      expect(target.pathname).toBe("/student/sprint");
      expect(target.searchParams.has("topics")).toBe(true);
    }
    const weak = page.getByRole("link", { name: "Practise", exact: true });
    for (const link of await weak.all()) {
      const target = new URL((await link.getAttribute("href"))!, page.url());
      expect(target.pathname).toBe("/student/sprint");
      expect(
        target.searchParams.get("history") === "mistakes" ||
          target.searchParams.has("verb"),
      ).toBe(true);
    }
    for (const link of await page
      .getByRole("link", { name: "Review cards", exact: true })
      .all()) {
      const target = new URL((await link.getAttribute("href"))!, page.url());
      expect(target.pathname).toBe("/student/flashcards");
      expect([...target.searchParams.keys()]).toEqual(["topic"]);
      expect(target.searchParams.has("topic")).toBe(true);
    }
    const target = new URL(
      (await practice.first().getAttribute("href"))!,
      page.url(),
    );
    await practice.first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Topic Sprint" }),
    ).toBeVisible();
    await expect(async () => {
      const config = JSON.parse(
        await page.locator('form input[name="config"]').first().inputValue(),
      );
      expect(config.topics).toContain(target.searchParams.get("topics"));
      if (target.searchParams.has("sub"))
        expect(config.subtopics).toContain(target.searchParams.get("sub"));
    }).toPass({ timeout: 20000 });
    // The Start button is deliberately never pressed: no sessions or AI calls.
  });
  test("history chips survive hydration and preserve the range", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Show chart data" }).first().click();
    await expect(async () => {
      await page.getByText("Filter score history", { exact: true }).click();
      if (new URL(page.url()).searchParams.get("kind") !== "sprint")
        await page
          .getByRole("button", { name: "Sprints", exact: true })
          .click();
      await expect(page).toHaveURL(/[?&]kind=sprint(?:&|$)/, { timeout: 1000 });
      await expect(
        page.getByRole("button", { name: "Sprints", exact: true }),
      ).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await expect(async () => {
      if (new URL(page.url()).searchParams.get("type") !== "short")
        await page.getByRole("button", { name: "Short", exact: true }).click();
      const url = new URL(page.url());
      expect(url.searchParams.get("kind")).toBe("sprint");
      expect(url.searchParams.get("type")).toBe("short");
      await expect(
        page.getByRole("button", { name: "Short", exact: true }),
      ).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
    }).toPass({ timeout: 20000 });
  });
  for (const width of [360, 400, 1280]) {
    test(`${width}px keeps topic tables within their containers`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await expect(page.getByTestId("activity-heatmap")).toHaveCount(0);
      const table = page.getByRole("table", {
        name: "Marks by topic",
        exact: true,
      });
      const parent = table.locator("button[aria-expanded]").first();
      await expect(async () => {
        if ((await parent.getAttribute("aria-expanded")) === "false")
          await parent.click();
        await expect(parent).toHaveAttribute("aria-expanded", "true", {
          timeout: 1000,
        });
      }).toPass({ timeout: 20000 });
      await expect(
        table.getByText(/answered · .* marks · Last practised/).first(),
      ).toHaveCount(1);
      const container = table.locator("..");
      await expect
        .poll(() =>
          container.evaluate((el) => el.scrollWidth >= el.clientWidth),
        )
        .toBe(true);
      const action = table.getByRole("link", { name: /^Practise / }).first();
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    });
  }
});

// Read-only hydration coverage against a local Supabase double; no account writes.
test.describe("Progress with local synthetic reads", () => {
  test.skip(
    ({ baseURL }) => baseURL !== "http://localhost:3284",
    "Requires the local Progress mock on port 54484",
  );
  test.beforeEach(async ({ context }) => {
    const id = "11111111-1111-4111-8111-111111111111";
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token =
      [
        { alg: "HS256", typ: "JWT" },
        { sub: id, aud: "authenticated", role: "authenticated", exp },
      ]
        .map((p) => Buffer.from(JSON.stringify(p)).toString("base64url"))
        .join(".") + ".c2lnbmF0dXJl";
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value:
          "base64-" +
          Buffer.from(
            JSON.stringify({
              access_token: token,
              refresh_token: "synthetic-refresh",
              expires_at: exp,
              token_type: "bearer",
              user: { id },
            }),
          ).toString("base64url"),
        url: "http://localhost:3284",
      },
    ]);
  });
  for (const width of [390, 1440]) {
    test(`real page ranges, dot points and score filters at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/student/progress");
      await expect(
        page.getByRole("heading", { level: 1, name: "Progress" }),
      ).toBeVisible();
      const topics = page.getByRole("table", { name: "Marks by topic" });
      const topic = topics.getByRole("button", {
        name: "Economic Issues",
        exact: true,
      });
      await topic.click();
      await expect(topic).toHaveAttribute("aria-expanded", "true");
      await expect(
        topics.getByRole("link", { name: "Practise Inflation" }),
      ).toHaveAttribute("href", "/student/sprint?topics=t3&sub=inflation");
      await page.getByRole("button", { name: "Show chart data" }).click();
      await expect(page.getByRole("link", { name: /60%/ })).toHaveAttribute(
        "href",
        "/student/activity/synthetic-2",
      );
      await page.getByText("Filter score history", { exact: true }).click();
      await page.getByRole("button", { name: "Sprints", exact: true }).click();
      await expect(page).toHaveURL(/kind=sprint/);
      await expect(
        page.getByRole("button", { name: "Sprints", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("radio", { name: "All time", exact: true }).click();
      await expect(page.getByTestId("progress-page")).toHaveAttribute(
        "data-range",
        "all",
      );
      expect(new URL(page.url()).searchParams.get("kind")).toBe("sprint");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
});
