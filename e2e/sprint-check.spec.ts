import { expect, test } from "@playwright/test";
import {
  adminClient,
  cleanupSessions,
  focusWithKeyboard,
  pick,
  signIn,
  start,
} from "./helpers";
for (const width of [390, 1600]) {
  test.describe(`Sprint check ${width}px`, () => {
    test.skip(!process.env.STUDENT_EMAIL, "Needs a synthetic student account");
    const ids: string[] = [];
    test.afterAll(async () => cleanupSessions(ids));
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page);
    });
    test("unchecked hint on hover/focus highlights Check and never blocks Next", async ({
      page,
    }) => {
      await start(page, "Multiple choice", ids, true);
      const next = page.getByRole("button", { name: "Next question" });
      await focusWithKeyboard(page, next);
      await expect(page.getByRole("tooltip")).toBeHidden();
      await pick(page, "A");
      const check = page.getByRole("button", { name: "Check answer" });
      await expect(check).toHaveAttribute(
        "aria-description",
        "You have an unchecked answer.",
      );
      await expect(check).toHaveClass(/ring-2/);
      if (width > 1000) await next.hover();
      else await focusWithKeyboard(page, next);
      await expect(page.getByRole("tooltip")).toContainText("check it first?");
      await next.click();
      await expect(page.getByText(/^Question 2 ·/)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Check answer" }),
      ).toBeDisabled();
      await expect(page.getByRole("tooltip")).toBeHidden();
    });
    test("a check error keeps the reminder; a successful retry clears it", async ({
      page,
    }) => {
      let error = true;
      await page.route("**/api/attempts/*/mark", (route) =>
        route.fulfill({
          status: error ? 503 : 200,
          contentType: "application/json",
          body: JSON.stringify(
            error
              ? { error: "Marking is paused. Try again." }
              : {
                  status: "marked",
                  mark: 1,
                  max_marks: 1,
                  feedback: { correct_index: 0 },
                  explanation: "Synthetic feedback.",
                },
          ),
        }),
      );
      await start(page, "Multiple choice", ids, true);
      await pick(page, "A");
      const check = page.getByRole("button", { name: "Check answer" });
      await check.click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Marking is paused." }),
      ).toBeVisible();
      await expect(check).toHaveAttribute(
        "aria-description",
        "You have an unchecked answer.",
      );
      error = false;
      await check.click();
      await expect(page.getByText("Correct", { exact: true })).toBeVisible();
      await expect(check).toHaveCount(0);
      await focusWithKeyboard(
        page,
        page.getByRole("button", { name: "Next question" }),
      );
      await expect(page.getByRole("tooltip")).toBeHidden();
    });
    test("written feedback annotates the answer, persists on resume and uses one mark", async ({
      page,
    }) => {
      let calls = 0;
      await page.route("**/api/attempts/*/mark", async (route) => {
        calls++;
        const body = {
          status: "marked",
          mark: 1,
          max_marks: 4,
          band: "Sound",
          feedback: {
            comments: [
              {
                quote: "Demand",
                start: 0,
                kind: "strength",
                tag: "Knowledge",
                body: "You identified demand.",
                next_mark: null,
              },
              {
                quote: "missing",
                start: 50,
                kind: "fix",
                tag: "Analysis",
                body: "Link demand to prices.",
                next_mark: "Explain spare capacity.",
              },
            ],
            better_answer_outline: [
              "Define demand-pull inflation.",
              "Explain price pressure.",
            ],
          },
        };
        const attemptId = route.request().url().split("/").at(-2)!;
        const { error } = await adminClient()!
          .from("attempts")
          .update({ ...body, check_status: "agreed" })
          .eq("id", attemptId);
        expect(error).toBeNull();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      });
      const id = await start(page, "Short answer", ids, true);
      await page
        .getByRole("textbox", { name: "Your answer" })
        .fill("Demand grows.");
      await page.getByRole("button", { name: "Check answer" }).click();
      const feedback = page.getByRole("region", {
        name: "Checked answer feedback",
      });
      await expect(feedback).toContainText("1 / 4");
      await expect(feedback).toContainText("Band: Sound");
      await expect(
        feedback.getByRole("button", { name: /^Strength 1/ }),
      ).toBeVisible();
      await expect(
        feedback.getByText("Overall", { exact: true }),
      ).toBeVisible();
      if (width > 1000) {
        const anchor = feedback.getByRole("button", { name: /^Strength 1/ });
        const card = feedback.locator("[data-anchored]").first();
        await expect(card).toBeVisible();
        await expect
          .poll(async () => {
            const [a, c] = await Promise.all([
              anchor.boundingBox(),
              card.boundingBox(),
            ]);
            return !!a && !!c && c.x > a.x + a.width;
          })
          .toBe(true);
      }
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await expect(
        feedback.getByRole("button", { name: "Fixes (1)", exact: true }),
      ).toBeVisible();
      await feedback
        .getByText("How to reach full marks", { exact: true })
        .click();
      await expect(
        feedback.getByText("Define demand-pull inflation."),
      ).toBeVisible();
      await expect(
        page.getByText("Full feedback in your results."),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Next question" }).click();
      await page.getByRole("button", { name: "Previous question" }).click();
      await expect(feedback).toContainText("Explain spare capacity.");
      expect(calls).toBe(1);
      await page.reload();
      // Resume selects the next unanswered question; return to the checked one.
      await page.getByRole("button", { name: "Previous question" }).click();
      await expect(feedback).toContainText(/Demand\d* grows\./);
      expect(calls).toBe(1);
      await expect(page).toHaveURL(new RegExp(`/student/sprint/${id}$`));
    });
    test("written check errors preserve text; retry with empty comments still shows score", async ({
      page,
    }) => {
      let error = true;
      await page.route("**/api/attempts/*/mark", (route) =>
        route.fulfill({
          status: error ? 500 : 200,
          contentType: "application/json",
          body: JSON.stringify(
            error
              ? { error: "Could not mark answer" }
              : {
                  status: "marked",
                  mark: 0,
                  max_marks: 4,
                  band: null,
                  feedback: { comments: [] },
                },
          ),
        }),
      );
      await start(page, "Short answer", ids, true);
      const answer = page.getByRole("textbox", { name: "Your answer" });
      await answer.fill("Demand grows.");
      await page.getByRole("button", { name: "Check answer" }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Could not mark answer" }),
      ).toBeVisible();
      await expect(answer).toHaveValue("Demand grows.");
      error = false;
      await page.getByRole("button", { name: "Check answer" }).click();
      const feedback = page.getByRole("region", {
        name: "Checked answer feedback",
      });
      await expect(feedback).toContainText("0 / 4");
      await expect(feedback).toContainText(/Demand\d* grows\./);
      await expect(
        feedback.getByRole("group", { name: "Filter comments" }),
      ).toHaveCount(0);
    });

    test("exam feedback mode never prompts to check", async ({ page }) => {
      await start(page, "Multiple choice", ids);
      await pick(page, "A");
      await focusWithKeyboard(
        page,
        page.getByRole("button", { name: "Next question" }),
      );
      await expect(page.getByRole("tooltip")).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Check answer" }),
      ).toHaveCount(0);
    });
  });
}
