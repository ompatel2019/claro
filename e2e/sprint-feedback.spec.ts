import { expect, test } from "@playwright/test";
import { adminClient, cleanupSessions, signIn } from "./helpers";

for (const width of [400, 1280]) {
  test.describe(`Sprint feedback ${width}px`, () => {
    test.skip(!process.env.STUDENT_EMAIL, "Needs a synthetic student account");
    const ids: string[] = [];
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page);
    });
    test.afterAll(async () => {
      await cleanupSessions(ids);
    });
    test("S4: essays are absent, including legacy saved setups and links", async ({
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
      await page.getByRole("button", { name: "Mixed", exact: true }).click();
      await expect(page.getByText(/Include an extended/)).toHaveCount(0);
      await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
      await page.getByRole("button", { name: /^Start (sprint|with)/ }).click();
      await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
      const id = page.url().split("/").at(-1)!;
      ids.push(id);
      const db = adminClient()!;
      const { data, error } = await db
        .from("attempts")
        .select("question:questions(type)")
        .eq("session_id", id);
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      expect(
        data!.every(
          (row) =>
            (row.question as unknown as { type: string }).type !== "extended",
        ),
      ).toBe(true);
    });
  });
}
