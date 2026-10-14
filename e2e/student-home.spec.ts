import { test, expect } from "./fixtures/weak-topic-student";
import { adminClient } from "./helpers";
import { sydneyToday } from "../src/lib/flashcards";

test.describe("Student Home quick launches", () => {
  test.skip(!adminClient(), "Needs Supabase test credentials");
  for (const width of [360, 1280]) {
    test(`launches stay above progress with empty and unfinished history at ${width}px`, async ({
      page,
      historyStudent,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      const launches = page.getByRole("region", { name: "Quick start" });
      const checkLaunches = async () => {
        await expect(launches).toBeVisible();
        await expect(
          launches.getByRole("heading", { name: "Topic Sprint", exact: true }),
        ).toBeVisible();
        await expect(
          launches.getByRole("heading", { name: "Flashcards", exact: true }),
        ).toBeVisible();
        await expect(
          launches.getByRole("button", { name: "20 MC questions · 20 min" }),
        ).toBeVisible();
        await expect(
          launches.getByRole("button", {
            name: "5 short answers · about 23 min",
          }),
        ).toBeVisible();
        await expect(
          launches.getByRole("link", { name: "Start sprint" }),
        ).toHaveAttribute("href", "/student/sprint");
        await expect(
          launches.getByRole("link", { name: "Choose a deck" }),
        ).toHaveAttribute("href", "/student/flashcards");
        await expect
          .poll(async () => {
            const [header, quick, stats] = await Promise.all([
              page.getByRole("heading", { level: 1 }).boundingBox(),
              launches.boundingBox(),
              page
                .getByText("Questions this week", { exact: true })
                .boundingBox(),
            ]);
            return (
              !!header &&
              !!quick &&
              !!stats &&
              quick.y >= header.y + header.height &&
              stats.y >= quick.y + quick.height
            );
          })
          .toBe(true);
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.documentElement.scrollWidth <=
                document.documentElement.clientWidth,
            ),
          )
          .toBe(true);
      };
      await checkLaunches();
      await expect(launches.getByText("0 due", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Continue where you left off" }),
      ).toHaveCount(0);

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
      await expect(
        launches.getByRole("button", { name: "Flashcards · 1 due" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Continue where you left off" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Continue", exact: true }),
      ).toHaveAttribute("href", /\/student\/activity\//);
      await launches.getByRole("link", { name: "Choose a deck" }).click();
      await expect(page).toHaveURL(/\/student\/flashcards$/);
    });
  }
});
