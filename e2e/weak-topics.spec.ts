import { test, expect } from "./fixtures/weak-topic-student";
import { adminClient } from "./helpers";

test.describe("Student progress summaries", () => {
  test.skip(!adminClient(), "Needs Supabase test credentials");
  for (const width of [360, 1280]) {
    test(`progress keeps practice and topic results together at ${width}px`, async ({
      page,
      historyStudent,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await historyStudent.addAnswers(2);
      await page.goto("/student/progress?range=all");
      await expect(page.getByRole("heading", { level: 2 })).toHaveText([
        "Practice average",
        "Marks by topic",
        "Your practice",
        "Where your marks go",
        "By question type",
        "Practice days",
      ]);
      await expect(
        page.getByText("Questions answered", { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("activity-heatmap")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
    test(`history load failures recover with Try again at ${width}px`, async ({
      page,
      historyStudent,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await historyStudent.addAnswers(3);
      const db = adminClient()!;
      {
        // Invalid saved metadata causes a real SQL error for this synthetic user only.
        const config = (marks: string | number) => ({
          question: { topic_id: "t3-inflation", marks },
        });
        const { error } = await db
          .from("sessions")
          .update({ config: config("invalid") })
          .eq("user_id", historyStudent.userId);
        if (error) throw error;
        await page.goto("/student/progress");
        const card = page.locator("main");
        await expect(card.getByRole("alert")).toHaveText(
          /Couldn't load this. Try again./,
        );
        await expect(
          card.getByRole("link", { name: "Retry questions", exact: true }),
        ).toHaveCount(0);
        const { error: repairError } = await db
          .from("sessions")
          .update({ config: config(5) })
          .eq("user_id", historyStudent.userId);
        if (repairError) throw repairError;
        await card.getByRole("button", { name: "Try again" }).click();
        await expect(
          card.getByRole("heading", { name: "Your practice", exact: true }),
        ).toBeVisible();
        await expect(card.getByRole("alert")).toHaveCount(0);
      }
    });
    test(`invalid range and expired login at ${width}px`, async ({
      page,
      historyStudent,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await historyStudent.addAnswers(2, 3);
      await historyStudent.addAnswers(1, 3);
      for (const path of ["/student/progress?range=invalid"]) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: "Marks by topic", exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId("progress-page")).toHaveAttribute(
          "data-range",
          "90",
        );
      }
      // An expired login must return to sign-in and retain the requested page.
      await page.context().clearCookies();
      await page.goto("/student/progress");
      await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
      expect(new URL(page.url()).searchParams.get("next")).toBe(
        "/student/progress",
      );
    });
  }
});
