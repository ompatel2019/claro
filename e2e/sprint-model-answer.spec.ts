import { expect, test } from "@playwright/test";
import { cleanupSessions, signIn, start } from "./helpers";

// S10: a written check shows the model answer with the same student-facing
// feedback as results. Marking is mocked: no AI calls.
test.describe("Sprint check model answer", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a synthetic student account");
  const ids: string[] = [];
  test.afterAll(async () => cleanupSessions(ids));

  test("shows the model answer and feedback, never guidelines or review notes", async ({
    page,
  }) => {
    await signIn(page);
    await page.route("**/api/attempts/*/mark", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "marked",
          mark: 2,
          max_marks: 4,
          band: "Sound",
          feedback: {
            comments: [
              {
                quote: "",
                start: null,
                kind: "fix",
                tag: "Analysis",
                body: "Link demand to prices.",
                next_mark: "Explain spare capacity.",
              },
            ],
          },
          sample_answer: "Synthetic model answer.",
        }),
      }),
    );
    await start(page, "Short answer", ids, true);
    await page
      .getByRole("textbox", { name: "Your answer" })
      .fill("Demand grows.");
    await page.getByRole("button", { name: "Check answer" }).click();
    const feedback = page.getByRole("region", {
      name: "Checked answer feedback",
    });
    await expect(feedback).toContainText("2/4");
    await expect(feedback).toContainText("Link demand to prices.");
    await expect(
      feedback.getByRole("heading", { name: "Sample answer" }),
    ).toBeVisible();
    await expect(feedback.getByText("Synthetic model answer.")).toBeVisible();
    await expect(feedback.getByText("Marking guidelines")).toHaveCount(0);
    await expect(feedback.getByText(/double-checking/)).toHaveCount(0);
  });
});
