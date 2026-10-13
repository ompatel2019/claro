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
