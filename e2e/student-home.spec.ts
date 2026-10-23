import { test, expect } from "./fixtures/weak-topic-student";
import { adminClient } from "./helpers";
import { sydneyToday } from "../src/lib/flashcards";

test.describe("Student Home quick launches", () => {
  test.skip(!adminClient(), "Needs Supabase test credentials");
  for (const width of [360, 1366]) {
    test(`next step actions fit the width with empty and unfinished history at ${width}px`, async ({
      page,
      historyStudent,
    }) => {
      await page.setViewportSize({ width, height: 768 });
      const launches = page.locator(".home-next");
      const checkLaunches = async () => {
        await expect(launches).toBeVisible();
        await expect(launches.getByRole("link")).toHaveCount(2);
        for (const [name, href] of [
          ["Start sprint", "/student/sprint"],
          ["Flashcards", "/student/flashcards"],
        ])
          await expect(
            launches.getByRole("link", { name: new RegExp(`^${name}`) }),
          ).toHaveAttribute("href", href);
        await expect(
          page.getByRole("heading", { name: "This week" }),
        ).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          )
          .toBe(true);
      };
      await checkLaunches();
      await expect(page.getByText("Continue where you left off")).toHaveCount(
        0,
      );

      await historyStudent.addAnswers(1);
      const db = adminClient()!;
      const { data: cards, error } = await db
        .from("flashcards")
        .select("id")
        .eq("status", "live")
        .limit(1);
      if (error) throw error;
      expect(cards?.length, "Needs one live flashcard").toBe(1);
      await db
        .from("flashcard_progress")
        .insert({
          user_id: historyStudent.userId,
          flashcard_id: cards![0].id,
          due_on: sydneyToday(),
          interval_days: 1,
          last_mark: 1,
        })
        .throwOnError();
      await page.reload();
      await checkLaunches();
      await expect(page.getByText("Continue where you left off")).toHaveCount(
        0,
      );
      await expect(page.locator(".home-week .done")).toBeVisible();
      await launches.getByRole("link", { name: /^Flashcards/ }).click();
      await expect(page).toHaveURL(/\/student\/flashcards$/);
    });
  }
});
