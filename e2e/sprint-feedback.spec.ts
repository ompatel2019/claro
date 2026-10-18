import { expect, test } from "@playwright/test";
import {
  adminClient,
  cleanupSessions,
  reviewSprintSetup,
  signIn,
} from "./helpers";

for (const width of [400, 1280]) {
  test.describe(`Sprint feedback ${width}px`, () => {
    test.skip(!process.env.STUDENT_EMAIL, "Needs a synthetic student account");
    const ids: string[] = [];
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, "/student/sprint");
    });
    test.afterAll(async () => {
      await cleanupSessions(ids);
    });
    test("S3: steps, back, review, advanced and reset preserve a prefill", async ({
      page,
    }) => {
      await page.goto("/student/sprint?type=short&size=45");
      const next = page.getByRole("button", { name: "Next", exact: true });
      const start = page.getByRole("button", { name: /^Start (sprint|with)/ });
      await expect(start).toBeDisabled();
      await page.keyboard.press("Control+Enter");
      await expect(page).toHaveURL(/\/student\/sprint\?/);
      await expect(page.getByText("Step 1 of 4")).toBeVisible();
      await next.click();
      await expect(
        page.getByRole("region", { name: "Question type", exact: true }),
      ).toBeHidden();
      await next.click();
      await expect(page.getByRole("textbox", { name: "Marks" })).toHaveValue(
        "45",
      );
      await page.getByRole("textbox", { name: "Marks" }).fill("999");
      await page.getByRole("textbox", { name: "Marks" }).blur();
      await expect(page.getByRole("textbox", { name: "Marks" })).toHaveValue(
        "60",
      );
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await next.click();
      await expect(page.getByRole("textbox", { name: "Marks" })).toHaveValue(
        "60",
      );
      await next.click();
      await expect(
        page.getByRole("radiogroup", { name: "Question history" }),
      ).toBeHidden();
      await page.getByRole("button", { name: "Advanced" }).click();
      await expect(
        page.getByRole("radiogroup", { name: "Question history" }),
      ).toBeVisible();
      await expect(
        page.getByRole("radiogroup", { name: "Order", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await expect(page.getByText("Step 1 of 4")).toBeVisible();
      await expect(start).toBeDisabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
    test("S3: count errors and empty pools remain visible through review", async ({
      page,
    }) => {
      await page.route("**/rest/v1/rpc/sprint_pool", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Synthetic failure" }),
        }),
      );
      await page.goto("/student/sprint");
      await reviewSprintSetup(page);
      await expect(
        page.getByText("Couldn't count matching questions."),
      ).toBeVisible();
      await page.unroute("**/rest/v1/rpc/sprint_pool");
      await page.goto("/student/sprint?type=short&history=flagged");
      await reviewSprintSetup(page);
      await expect(page.getByText("No questions match")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Start (sprint|with)/ }),
      ).toBeDisabled();
    });
    test("S4/S6: essays are absent, including legacy saved setups and links", async ({
      page,
    }) => {
      await page.goto("/student/sprint");
      await page.evaluate(() =>
        localStorage.setItem(
          "claro.sprint.v1",
          JSON.stringify({
            mode: "extended",
            target: 1,
            include_extended: true,
          }),
        ),
      );
      await page.goto("/student/sprint?type=extended");
      await expect(
        page.getByRole("button", { name: "Multiple choice", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByText("Extended response", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("radiogroup", { name: "Order", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Mixed", exact: true }).click();
      await expect(page.getByText(/Include an extended/)).toHaveCount(0);
      await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
      await reviewSprintSetup(page);
      await page.getByRole("button", { name: /^Start (sprint|with)/ }).click();
      await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
      const id = page.url().split("/").at(-1)!;
      ids.push(id);
      const db = adminClient()!;
      const { data, error } = await db
        .from("attempts")
        .select("position,question:questions(type)")
        .eq("session_id", id)
        .order("position");
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      expect(
        data!.every(
          (row) =>
            (row.question as unknown as { type: string }).type !== "extended",
        ),
      ).toBe(true);
      const types = data!.map(
        (row) => (row.question as unknown as { type: string }).type,
      );
      expect(types).toEqual(
        [...types].sort(
          (a, b) => Number(a === "short") - Number(b === "short"),
        ),
      );
    });
  });
}

// Iteration 2 lane B: local read-only results coverage.
test.describe("Local results feedback", () => {
  test.skip(
    ({ baseURL }) => baseURL !== "http://localhost:3104",
    "Run with e2e/sprint-results.config.ts (local fixtures only)",
  );
  const sessionId = (n: number) => `22222222-2222-4222-8222-22222222000${n}`;
  test.beforeEach(async ({ context, page }) => {
    const token =
      [
        { alg: "HS256", typ: "JWT" },
        {
          sub: "11111111-1111-4111-8111-111111111111",
          aud: "authenticated",
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      ]
        .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
        .join(".") + ".c2lnbmF0dXJl";
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value:
          "base64-" +
          Buffer.from(
            JSON.stringify({
              access_token: token,
              refresh_token: "fake-refresh",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              token_type: "bearer",
              user: { id: "11111111-1111-4111-8111-111111111111" },
            }),
          ).toString("base64url"),
        url: "http://localhost:3104",
      },
    ]);
    await page.route("**/api/**", (route) => {
      throw new Error(
        `Unexpected API call: ${new URL(route.request().url()).pathname}`,
      );
    });
  });
  for (const width of [390, 1280]) {
    test(`next steps, question links and honest guidelines at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/student/sprint/${sessionId(1)}/results`);
      const next = page.getByRole("region", { name: "Next steps" });
      await expect(next).toBeVisible();
      await expect(
        next.getByRole("link", { name: "Retry mistakes on Inflation" }),
      ).toHaveAttribute("href", /sub=inflation&history=mistakes/);
      await expect(
        next.getByRole("link", { name: /Review 1 flashcard/ }),
      ).toHaveAttribute("href", "/student/flashcards?topic=inflation");
      const headings = await page.getByRole("heading").allTextContents();
      expect(headings.indexOf("Next steps")).toBeLessThan(
        headings.indexOf("Strengths"),
      );
      await expect(
        page.getByText("Sun 18 Oct · 6:00", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Q2 · Short answer", exact: true })
        .click();
      await expect(page.getByText("Question 2", { exact: true })).toBeVisible();
      await expect(page.getByText("Next mark:", { exact: true })).toHaveCount(
        0,
      );
      await expect(
        page.getByText("Aggregate advice stays visible.", { exact: true }),
      ).toBeVisible();
      await page.getByText("Marking guidelines", { exact: true }).click();
      await expect(page.getByText(/guidelines are incomplete/)).toBeVisible();
      await expect(page.locator("#q-2 table")).toHaveCount(0);
      await expect(
        page.getByText("How to reach full marks", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Q3 · Short answer", exact: true })
        .click();
      await expect(page.getByText("Question 3", { exact: true })).toBeVisible();
      await expect(
        page.getByText("How to reach full marks", { exact: true }),
      ).toHaveCount(0);
      await expect(page.locator("#q-3 table")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/lane-b-results-${width}.png`,
        fullPage: true,
      });
    });
  }
  test("single-answer results hide outlines at full marks and keep them for partial marks", async ({
    page,
  }) => {
    await page.goto(`/student/activity/${sessionId(2)}`);
    await expect(
      page.getByText("5 / 5", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("How to reach full marks", { exact: true }),
    ).toHaveCount(0);
    await page.goto(`/student/activity/${sessionId(3)}`);
    await expect(
      page.getByText("How to reach full marks", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Next mark:", { exact: true })).toHaveCount(0);
  });
  for (const [suffix, message] of [
    [4, "An overall summary isn’t available"],
    [5, "once marking finishes"],
  ] as const) {
    test(`keeps topic actions when the summary is ${suffix === 4 ? "unavailable" : "pending"}`, async ({
      page,
    }) => {
      await page.goto(`/student/sprint/${sessionId(suffix)}/results`);
      await expect(page.getByText(message, { exact: false })).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Next steps" })
          .getByRole("link", { name: "Retry mistakes on Inflation" }),
      ).toBeVisible();
    });
  }
});
