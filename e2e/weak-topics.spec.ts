import { test, expect } from "./fixtures/weak-topic-student";
import { adminClient } from "./helpers";

function weakCard(page: import("@playwright/test").Page) {
  return page
    .getByRole("heading", {
      name: "Weak spots",
      exact: true,
    })
    .locator('xpath=ancestor::*[@data-slot="card"]');
}

test.describe("S17/S2 topic history", () => {
  test.skip(!adminClient(), "Needs Supabase test credentials");
  for (const width of [360, 1280]) {
    test(`history boundaries and breakdown layout at ${width}px`, async ({
      page,
      historyStudent,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      const checkProgress = async (copy: RegExp | null, unlocked: boolean) => {
        await page.goto("/student/progress?range=all");
        const card = weakCard(page);
        await expect(card).toBeVisible();
        if (copy) await expect(card.getByText(copy)).toBeVisible();
        const practice = card.getByRole("link", {
          name: "Practise",
          exact: true,
        });
        await expect(practice).toHaveCount(unlocked ? 1 : 0);
        if (unlocked)
          await expect(practice).toHaveAttribute(
            "href",
            `/student/sprint?topics=t3&sub=t3-inflation&history=mistakes`,
          );
        const headings = page.getByRole("heading", { level: 2 });
        await expect(headings.first()).toHaveText("Marks by topic");
        await expect(
          page.getByText("By directive verb", { exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId("activity-heatmap")).toHaveCount(0);
        await expect(
          page.getByText("Questions answered", { exact: true }),
        ).toHaveCount(0);
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
      await checkProgress(
        /unlock after 3 marked answers across 2 sessions/,
        false,
      );
      await historyStudent.addAnswers(2);
      await checkProgress(/Answer 1 more question in Inflation/, false);
      // Three answers from the same session still require a second session.
      const db = adminClient()!;
      const { data: session, error } = await db
        .from("sessions")
        .select("id")
        .eq("user_id", historyStudent.userId)
        .single();
      if (error) throw error;
      const { error: insertError } = await db.from("attempts").insert({
        user_id: historyStudent.userId,
        session_id: session.id,
        position: 3,
        answer_text: "Synthetic boundary answer",
        status: "marked",
        mark: 1,
        max_marks: 5,
        marked_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
      await checkProgress(/Practise Inflation in another session/, false);
      await historyStudent.addAnswers(1);
      await checkProgress(null, true);
      await weakCard(page)
        .getByRole("link", { name: "Practise", exact: true })
        .click();
      await expect(page).toHaveURL(
        /\/student\/sprint\?topics=t3&sub=t3-inflation&history=mistakes/,
      );
      await expect(
        page.getByRole("heading", { level: 1, name: "Topic Sprint" }),
      ).toBeVisible();
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
        const card = weakCard(page);
        await expect(card.getByRole("alert")).toHaveText(
          /Couldn't load your weak (spots|topics)/,
        );
        await expect(
          card.getByRole("link", { name: "Practise", exact: true }),
        ).toHaveCount(0);
        const { error: repairError } = await db
          .from("sessions")
          .update({ config: config(5) })
          .eq("user_id", historyStudent.userId);
        if (repairError) throw repairError;
        await card.getByRole("button", { name: "Try again" }).click();
        await expect(
          card.getByText(/Practise Inflation in another session/),
        ).toBeVisible();
        await expect(card.getByRole("alert")).toHaveCount(0);
      }
    });
    test(`60% boundary, invalid range and lost session at ${width}px`, async ({
      page,
      historyStudent,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await historyStudent.addAnswers(2, 3);
      await historyStudent.addAnswers(1, 3);
      for (const path of ["/student/progress?range=invalid"]) {
        await page.goto(path);
        await expect(
          weakCard(page).getByText("No weak spots in this range"),
        ).toBeVisible();
        await expect(
          weakCard(page).getByRole("link", {
            name: "Practise",
            exact: true,
          }),
        ).toHaveCount(0);
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
