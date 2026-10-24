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
    test("S3: bounded sizing, advanced and reset preserve a prefill", async ({
      page,
    }) => {
      await page.goto("/student/sprint?type=short&size=45");
      await reviewSprintSetup(page);
      const marks = page.getByRole("spinbutton", {
        name: "Marks",
        exact: true,
      });
      const start = page.getByRole("button", { name: /^Start (sprint|with)/ });
      await expect(marks).toHaveValue("45");
      await marks.fill("999");
      await marks.blur();
      await expect(marks).toHaveValue("60");
      await expect(
        page.getByRole("button", { name: "Increase total marks" }),
      ).toBeDisabled();
      await expect(start).toBeEnabled();
      await expect(
        page.getByRole("radiogroup", { name: "Question history" }),
      ).toBeVisible();
      await expect(marks).toHaveValue("60");
      await expect(
        page.getByRole("radiogroup", { name: "Order", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Multiple choice", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("spinbutton", { name: "Questions", exact: true }),
      ).toHaveValue("20");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
    test("S3: count errors and empty pools remain visible with sizing controls", async ({
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
      await expect(
        page.getByTestId("sprint-summary-bar").getByText("Matching"),
      ).toBeVisible();
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
    ({ baseURL }) =>
      baseURL !== `http://localhost:${process.env.RESULTS_APP_PORT ?? 3104}`,
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
        url: `http://localhost:${process.env.RESULTS_APP_PORT ?? 3104}`,
      },
    ]);
    await page.route("**/api/**", (route) => {
      throw new Error(
        `Unexpected API call: ${new URL(route.request().url()).pathname}`,
      );
    });
  });
  test("results of a session still being marked show progress, not the question page", async ({
    page,
  }) => {
    // Old sprint results links permanently redirect to Activity.
    const old = await page.request.get(
      `/student/sprint/${sessionId(6)}/results`,
      { maxRedirects: 0 },
    );
    expect(old.status()).toBe(308);
    expect(old.headers().location).toBe(`/student/activity/${sessionId(6)}`);
    await page.goto(`/student/sprint/${sessionId(6)}/results`);
    await expect(page).toHaveURL(
      new RegExp(`/student/activity/${sessionId(6)}$`),
    );
    await expect(page.getByText("Marking in progress")).toBeVisible();
    await expect(
      page.getByText("1 of 2 marked", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar")).toBeVisible();
  });
  const control = (what: "reset" | "finish", n: number) =>
    fetch(
      `http://127.0.0.1:${process.env.MOCK_PORT ?? 54328}/__${what}/${sessionId(n)}`,
    );
  test("in-progress results fill in by themselves once all answers are marked and the session finishes", async ({
    page,
  }) => {
    await control("reset", 7);
    await page.goto(`/student/activity/${sessionId(7)}`);
    await expect(page.getByText("Marking in progress")).toBeVisible();
    // All marked but not finished: still the card, never a blank page.
    await expect(page.getByText("Finishing your results…")).toBeVisible({
      timeout: 10_000,
    });
    // No reload: the interval refresh renders the finished results.
    await expect(
      page.getByText("Overall feedback", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Marking in progress")).toHaveCount(0);
  });
  test("results fill in when the marking tab was closed: the page finishes the session itself after 15 s", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await control("reset", 8);
    let finishCalls = 0;
    await page.route("**/api/sessions/*/finish", async (route) => {
      finishCalls++;
      await control("finish", 8);
      await route.fulfill({ json: { finished: true } });
    });
    const start = Date.now();
    await page.goto(`/student/activity/${sessionId(8)}`);
    await expect(page.getByText("Finishing your results…")).toBeVisible({
      timeout: 10_000,
    });
    expect(finishCalls).toBe(0);
    await expect(
      page.getByText("Overall feedback", { exact: true }),
    ).toBeVisible({ timeout: 40_000 });
    expect(finishCalls).toBe(1);
    expect(Date.now() - start).toBeGreaterThan(14_000);
  });
  for (const width of [390, 1280]) {
    test(`stat strip, question card and actions at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/student/activity/${sessionId(1)}`);
      await expect(
        page.getByRole("heading", { name: "Your next step" }),
      ).toHaveCount(0);
      const headings = await page.getByRole("heading").allTextContents();
      // Strengths and fixes sum up the sprint, so they lead.
      expect(headings.indexOf("Strengths and fixes")).toBeLessThan(
        headings.indexOf("Your answers"),
      );
      await expect(
        page.getByText(/^Sun 18 Oct, \d+:\d{2} [ap]m · \d+ questions?$/),
      ).toBeVisible();
      const stats = page.getByRole("region", { name: "Summary" });
      for (const label of ["Score", "Time", "Full marks"])
        await expect(stats.getByText(label, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: /^Question 2,/ }).click();
      await expect(page.getByText("Question 2", { exact: true })).toBeVisible();
      const score = page
        .locator("#q-2")
        .getByRole("complementary", { name: "Your mark: 3/5" });
      await expect(score).toContainText("3/5 marks");
      await expect(score).toContainText("2 to gain");
      await expect(score).toContainText(
        "Your next mark: Aggregate advice stays visible.",
      );
      await expect(score).not.toContainText("Marked");
      // Every comment shows at once in the column; no slider.
      const column = page
        .locator("#q-2")
        .getByRole("region", { name: "Comments", exact: true });
      await expect(column.locator("[data-card]")).toHaveCount(2);
      await expect(column.locator("[data-card]").first()).toContainText(
        "Your next mark: Stored per-comment advice.",
      );
      await expect(
        column.getByRole("button", { name: "Next comment" }),
      ).toHaveCount(0);
      // The actions row sits above the question card.
      const actionsBox = await page
        .getByRole("link", { name: "Practise a similar question" })
        .boundingBox();
      const cardBox = await page.locator("#q-2").boundingBox();
      expect(actionsBox!.y).toBeLessThan(cardBox!.y);
      // One flat card: no criteria table and no "How to reach full marks".
      await expect(page.locator("#q-2 table")).toHaveCount(0);
      await expect(
        page.getByText("How to reach full marks", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Practise a similar question" }),
      ).toHaveAttribute("href", /^\/student\/sprint\?type=\w+&sub=inflation$/);
      await expect(
        page.getByRole("link", { name: /flashcards$/ }),
      ).toHaveAttribute("href", "/student/flashcards?topic=inflation");
      await page.getByRole("button", { name: /^Question 3,/ }).click();
      await expect(page.getByText("Question 3", { exact: true })).toBeVisible();
      const sample = page
        .locator("#q-3 details")
        .filter({ hasText: "Full-marks answer" });
      await expect(sample).not.toHaveAttribute("open");
      await sample.getByText("Full-marks answer", { exact: true }).click();
      await expect(
        sample.getByText(
          "Higher demand increases prices when supply is constrained.",
        ),
      ).toBeVisible();

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
  test("partial-mark comparison keeps semantic notes and the full-marks answer", async ({
    page,
  }) => {
    await page.goto(`/student/activity/${sessionId(9)}`);
    await page.getByRole("button", { name: /^Question 2,/ }).click();
    const review = page.locator("#q-2");
    await expect(review.getByRole("table")).toHaveCount(0);
    const score = review.getByRole("complementary", {
      name: "Your mark: 3/5",
      exact: true,
    });
    await expect(score).toContainText("3/5 marks");
    await expect(score).toContainText("2 to gain");
    await expect(score).toContainText("Band: 3–5 marks");
    const points = score.getByRole("list", { name: "Marking points" });
    await expect(
      points
        .getByRole("listitem")
        .filter({ hasText: "Identifies price pressure." }),
    ).toContainText("Earned");
    await expect(
      points
        .getByRole("listitem")
        .filter({ hasText: "Explains the supply constraint." }),
    ).toContainText("Missed");
    await expect(review.getByRole("button", { name: /^Fix 1,/ })).toHaveClass(
      /cma-hl--missed/,
    );
    await expect(
      review.getByRole("button", { name: /^Strength 2,/ }),
    ).toHaveClass(/cma-hl--earned/);
    await expect(
      review.getByText("Full-marks answer", { exact: true }),
    ).toBeVisible();
    const column = review.getByRole("region", {
      name: "Comments",
      exact: true,
    });
    const fixCard = column.locator("[data-card]").first();
    const strengthCard = column.locator("[data-card]").nth(1);
    await expect(fixCard).toContainText("Explain the link to supply.");
    await expect(fixCard).toContainText(
      "Your next mark: Stored per-comment advice.",
    );
    await expect(strengthCard).toContainText(
      "You identify the effect on prices.",
    );
    // A highlight focuses its comment and dims the other; the page does not scroll.
    const fix = review.getByRole("button", { name: /^Fix 1,/ });
    const y0 = await page.evaluate(() => window.scrollY);
    await fix.click();
    await expect(fixCard).toHaveAttribute("aria-pressed", "true");
    await expect(strengthCard).toHaveAttribute("data-dim", "true");
    await expect(fix).toHaveAttribute("data-selected", "true");
    expect(await page.evaluate(() => window.scrollY)).toBe(y0);
    // A comment lights up its phrase.
    await strengthCard.click();
    await expect(strengthCard).toHaveAttribute("aria-pressed", "true");
    await expect(
      review.getByRole("button", { name: /^Strength 2,/ }),
    ).toHaveAttribute("data-selected", "true");
    await expect(fixCard).toHaveAttribute("data-dim", "true");
    await page
      .getByRole("link", { name: "Go to Q3", exact: true })
      .first()
      .click();
    await expect(page.locator("#q-3")).toBeInViewport();
    await page.getByRole("button", { name: /^Question 2,/ }).click();
    await expect(page.locator("#q-2")).toBeVisible();
    await expect(page).toHaveURL(/#q-3$/);
    await page
      .getByRole("link", { name: "Go to Q3", exact: true })
      .first()
      .click();
    await expect(page.locator("#q-3")).toBeInViewport();
    await expect(
      page.getByRole("button", { name: /^Question 3,/ }),
    ).toHaveAttribute("aria-current", "true");
  });
  test("single-answer results show full marks and actionable partial-mark feedback", async ({
    page,
  }) => {
    await page.goto(`/student/activity/${sessionId(2)}`);
    await expect(
      page.getByRole("img", { name: "5 out of 5", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("How to reach full marks", { exact: true }),
    ).toHaveCount(0);
    const scoreCard = page.locator('[data-slot="card"]').filter({
      has: page.getByRole("img", { name: "5 out of 5", exact: true }),
    });
    await expect(
      scoreCard.getByText("Full marks", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: /^Your mark:/ }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Comments", exact: true })
        .getByRole("group"),
    ).toContainText("Stored per-comment advice.");
    await expect(
      page.getByText("Keep building on these strengths", { exact: true }),
    ).toBeVisible();
    await page.goto(`/student/activity/${sessionId(3)}`);
    await expect(
      page.getByRole("img", { name: "3 out of 5", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("2 marks from full marks", { exact: true }),
    ).toBeVisible();
    const next = page.locator('[data-slot="card"]').filter({
      has: page
        .locator('[data-slot="card-title"]')
        .filter({ hasText: /^Your next mark$/ }),
    });
    await expect(
      next.getByText("Stored per-comment advice.", { exact: true }),
    ).toBeVisible();
    await expect(
      next.getByRole("link", { name: "Rewrite with these fixes" }),
    ).toHaveAttribute("href", "/student/mark?question=question-2");
    await expect(
      page.getByText("How to reach full marks", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: /^Your mark:/ }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Comments", exact: true })
        .getByRole("group"),
    ).toContainText("Your next mark: Stored per-comment advice.");
  });
  for (const [suffix, message] of [
    [4, "An overall summary isn’t available"],
    [5, "once marking finishes"],
  ] as const) {
    test(`keeps topic actions when the summary is ${suffix === 4 ? "unavailable" : "pending"}`, async ({
      page,
    }) => {
      await page.goto(`/student/activity/${sessionId(suffix)}`);
      await expect(page.getByText(message, { exact: false })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Practise a similar question" }),
      ).toBeVisible();
    });
  }
});
