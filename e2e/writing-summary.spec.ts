import { expect, test } from "@playwright/test";
import { adminClient, signIn } from "./helpers";
import { disputeStudent } from "./fixtures/dispute-student";

// Stored summaries exercise the real results page without an AI call or real student history.
test.describe("S13 writing-pattern summaries", () => {
  test.skip(
    !adminClient(),
    "Needs Supabase service credentials for an isolated synthetic student",
  );
  let fixture: Awaited<ReturnType<typeof disputeStudent>>;
  test.beforeEach(async () => {
    fixture = await disputeStudent(1);
    await adminClient()!
      .from("attempts")
      .update({
        answer_text:
          "Inflation means rising prices. Higher demand pushes prices up.",
        feedback: {
          comments: [
            {
              quote: "Higher demand",
              start: 31,
              kind: "fix",
              tag: "Analysis",
              body: "Explain why demand exceeds supply in this example.",
              next_mark: "Link spending to the price rise.",
            },
          ],
          better_answer_outline: [
            "Define inflation.",
            "Explain the demand mechanism.",
          ],
        },
      })
      .eq("id", fixture.attempts[0])
      .throwOnError();
  });
  test.afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  for (const width of [390, 1280]) {
    test(`writing advice stays distinct from per-question corrections at ${width}px`, async ({
      page,
    }) => {
      const summary = {
        strengths: [
          "In this answer, you define the key term before explaining the effect.",
        ],
        improvements: [
          "In this answer, make the link between cause and effect explicit.",
        ],
        next_steps: ["Rewrite your explanation using a because link."],
      };
      await adminClient()!
        .from("sessions")
        .update({ summary })
        .eq("id", fixture.sessions[0])
        .throwOnError();
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, fixture.email, fixture.password);
      await page.goto(`/student/activity/${fixture.sessions[0]}`);
      for (const label of ["Strengths", "Top fixes", "Next steps"])
        await expect(
          page.getByRole("heading", { name: label, exact: true }).first(),
        ).toBeVisible();
      for (const line of Object.values(summary).flat())
        await expect(page.getByText(line, { exact: true })).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Comments", exact: true })
          .getByRole("group", { name: "Comment 1 of 1" })
          .getByText("Explain why demand exceeds supply in this example.", {
            exact: true,
          }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.reload();
      await expect(
        page.getByText(summary.strengths[0], { exact: true }),
      ).toBeVisible();
    });
  }

  test("sparse writing feedback and unavailable summaries keep question feedback usable", async ({
    page,
  }) => {
    const summary = {
      strengths: [],
      improvements: [],
      next_steps: [
        "There is not enough writing to assess habits. Try a short written answer.",
      ],
    };
    const save = (value: typeof summary | null) =>
      adminClient()!
        .from("sessions")
        .update({ summary: value })
        .eq("id", fixture.sessions[0])
        .throwOnError();
    await save(summary);
    await signIn(page, fixture.email, fixture.password);
    await page.goto(`/student/activity/${fixture.sessions[0]}`);
    await expect(
      page.getByText(summary.next_steps[0], { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Top fixes", exact: true }).first(),
    ).toBeVisible();
    await save(null);
    await page.reload();
    await expect(
      page.getByText(/An overall summary isn’t available for this sprint/),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Comments", exact: true })
        .getByRole("group", { name: "Comment 1 of 1" })
        .getByText("Explain why demand exceeds supply in this example.", {
          exact: true,
        }),
    ).toBeVisible();
  });
});
