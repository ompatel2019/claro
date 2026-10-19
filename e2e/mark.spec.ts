import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Mark my answer form — no AI or writes", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Needs a student account",
  );
  test.beforeEach(async ({ page }) => {
    // Guardrails: these tests must never create sessions, mark or transcribe.
    await page.route("**/api/attempts/**", (route) => {
      throw new Error(`Forbidden AI request: ${route.request().url()}`);
    });
    await page.route(
      /\/student\/(?:mark|activity\/[^/?]+)(?:\?|$)/,
      async (route) => {
        if (route.request().method() !== "GET")
          throw new Error("Form tests must not invoke server actions");
        await route.continue();
      },
    );
    await signIn(page);
    await page.goto("/student/mark");
  });
  const ownTest =
    process.env.ENABLE_OWN_QUESTION_MARKING === "true" ? test : test.skip;
  const bankTest =
    process.env.ENABLE_OWN_QUESTION_MARKING === "true" ? test.skip : test;
  for (const width of [390, 1280]) {
    ownTest(
      `enabled own question validates input and auto-fills its verb at ${width}px`,
      async ({ page }) => {
        await page.setViewportSize({ width, height: 850 });
        const submit = page.getByRole("button", {
          name: "Mark my answer",
          exact: true,
        });
        await expect(submit).toBeDisabled();
        await expect(async () => {
          await page
            .getByRole("button", { name: "My own question", exact: true })
            .click();
          await expect(
            page.getByRole("textbox", { name: /Question text/ }),
          ).toBeVisible();
        }).toPass();
        await expect(async () => {
          await page
            .getByRole("textbox", { name: /Question text/ })
            .fill("Explain");
          await page.getByRole("textbox", { name: /Question text/ }).blur();
          await expect(
            page.getByText("Use at least 10 characters for your question."),
          ).toBeVisible();
        }).toPass();
        await expect(async () => {
          await page
            .getByRole("textbox", { name: /Question text/ })
            .fill("Evaluate the effectiveness of monetary policy.");
          await expect(
            page.getByRole("combobox", { name: "Directive verb" }),
          ).toContainText("Evaluate");
        }).toPass();
        await expect(async () => {
          await page
            .getByRole("button", { name: "Photo", exact: true })
            .click();
          await expect(page.getByLabel("Take photo / Upload")).toBeVisible();
        }).toPass();
        await expect(async () => {
          await page.getByRole("button", { name: "Type", exact: true }).click();
          await expect(
            page.getByRole("textbox", { name: "Your answer" }),
          ).toBeVisible();
        }).toPass();
        await expect(submit).toBeDisabled();
      },
    );
  }
  for (const width of [390, 1280]) {
    bankTest(
      `default bank-only handles empty searches and stale own drafts at ${width}px`,
      async ({ page }) => {
        await page.setViewportSize({ width, height: 850 });
        await expect(
          page.getByRole("button", { name: "My own question", exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByRole("button", {
            name: "From the Claro bank",
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByLabel("Search questions")
          .fill("synthetic missing question zzz");
        await expect(
          page.getByText(
            "No questions match. Try another search or change your filters.",
          ),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Mark my answer", exact: true }),
        ).toBeDisabled();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          )
          .toBe(true);
        await expect
          .poll(() =>
            page.evaluate(() =>
              Object.keys(localStorage).some((k) =>
                k.startsWith("claro.single."),
              ),
            ),
          )
          .toBe(true);
        await page.evaluate(() => {
          const key = Object.keys(localStorage).find((k) =>
            k.startsWith("claro.single."),
          )!;
          const draft = JSON.parse(localStorage.getItem(key)!);
          localStorage.setItem(
            key,
            JSON.stringify({
              ...draft,
              source: "own",
              selected: "",
              sessionId: null,
              own: {
                stem: "Explain inflation.",
                marks: 4,
                verb: "explain",
                topic_id: null,
                criteria_text: null,
              },
              answer: {
                answer_text: "Saved synthetic answer",
                transcript: null,
                image_paths: null,
              },
            }),
          );
        });
        await page.reload();
        await expect(
          page.getByRole("textbox", { name: "Your answer" }),
        ).toHaveValue("Saved synthetic answer");
        await expect(
          page.getByRole("textbox", { name: /Question text/ }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Mark my answer", exact: true }),
        ).toBeDisabled();
      },
    );
  }

  test("bank search shows selectable results and an empty search state", async ({
    page,
  }) => {
    await expect(async () => {
      await page.getByLabel("Search questions").fill("inflation");
      await expect(
        page.getByRole("option", { name: /inflation/i }).first(),
      ).toBeVisible();
    }).toPass();
    await expect(async () => {
      await page
        .getByRole("option", { name: /inflation/i })
        .first()
        .click();
      await expect(page.getByText("Answering", { exact: true })).toBeVisible();
    }).toPass();
    await expect(async () => {
      await page.getByLabel("Search questions").fill("no-such-question-zzzz");
      await expect(page.getByText(/No questions match/)).toBeVisible();
    }).toPass();
  });
});
