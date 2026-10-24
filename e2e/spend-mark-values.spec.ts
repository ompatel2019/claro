import { expect, test } from "@playwright/test";
import { adminClient, signInAdmin } from "./helpers";
import { disputeStudent } from "./fixtures/dispute-student";

test.describe("spend by written mark value", () => {
  test.skip(
    !adminClient() || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Needs an admin and service credentials",
  );
  test.describe.configure({ mode: "serial" });
  let fixture: Awaited<ReturnType<typeof disputeStudent>>;
  let usageIds: number[] = [];
  test.beforeEach(async () => {
    fixture = await disputeStudent(6);
    const db = adminClient()!;
    const marks = [2, 3, 4, 6, 8, 10];
    for (const [index, value] of marks.entries())
      await db
        .from("attempts")
        .update({ max_marks: value })
        .eq("id", fixture.attempts[index])
        .throwOnError();
    const { data } = await db
      .from("ai_usage")
      .insert(
        marks.map((value, index) => ({
          user_id: fixture.userId,
          attempt_id: fixture.attempts[index],
          model: "synthetic-e2e",
          task: "mark_written",
          input_tokens: 0,
          output_tokens: 0,
          cached_tokens: 0,
          usd: value / 10000,
        })),
      )
      .select("id")
      .throwOnError();
    usageIds = (data ?? []).map((r) => r.id);
  });
  test.afterEach(async () => {
    if (usageIds.length)
      await adminClient()!
        .from("ai_usage")
        .delete()
        .in("id", usageIds)
        .throwOnError();
    usageIds = [];
    if (fixture) await fixture.cleanup();
  });
  for (const width of [400, 1280])
    test(`mark-value bands, finite averages and empty historical range at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await signInAdmin(page);
      await page.goto("/admin/spend");
      const card = page
        .getByRole("heading", { name: "Cost per marked answer" })
        .locator('xpath=ancestor::*[@data-slot="card"][1]');
      await expect(card).toContainText("without a linked answer");
      const table = card.getByRole("table", { name: "Cost per marked answer" });
      for (const label of [
        "1–2 marks",
        "3 marks",
        "4 marks",
        "5–6 marks",
        "7–8 marks",
        "9+ marks",
      ]) {
        const band = table.getByRole("row").filter({ hasText: label });
        await expect(band.getByRole("cell").nth(2)).toHaveText(/^[1-9]\d*$/);
        await expect(band.getByRole("cell").last()).toHaveText(
          /^(<\$0\.001|\$\d+\.\d{3})$/,
        );
      }
      await expect(page.locator("main")).not.toContainText(/NaN|Infinity/);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.goto(
        "/admin/spend?range=custom&from=2020-01-01&to=2020-01-01",
      );
      await expect(
        card.getByRole("cell", { name: "—", exact: true }),
      ).toHaveCount(6);
      await expect(card).toContainText("counted here: $0.00");
    });
});
