import { expect, test } from "@playwright/test";
import {
  adminClient,
  cleanupSessions,
  pick,
  reviewSprintSetup,
  signIn,
} from "./helpers";

test.describe("Sprint session", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  const ids: string[] = [];
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  async function setUp(
    page: import("@playwright/test").Page,
    options: string[],
  ) {
    await page.goto("/student/sprint?type=mcq&sub=t3-inflation&size=5");
    await expect(
      page.getByTestId("sprint-summary-bar").getByText("Matching"),
    ).toBeVisible();
    await reviewSprintSetup(page);
    for (const name of options) await page.getByRole("radio", { name }).click();
    await page.getByRole("button", { name: /^Start (sprint|with)/ }).click();
    await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
    const id = page.url().split("/").at(-1)!;
    ids.push(id);
    return id;
  }

  test("check as you go locks the answer and shows the key", async ({
    page,
  }) => {
    await setUp(page, ["Check as I go"]);
    // The booklet sidebar is open by default; the meta pills sit above the question.
    await expect(
      page.getByRole("list", { name: "Question details" }),
    ).toContainText(/Question 1\s*Multiple choice\s*1 mark/);
    const check = page.getByRole("button", { name: "Check answer" });
    await expect(check).toBeDisabled();
    await pick(page, "A");
    await check.click();
    const result = page
      .getByRole("status")
      .filter({ hasText: /^(Correct|Incorrect · Answer: [ABCD])/ });
    await expect(result).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /^Option B:/ }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("navigation", { name: "Question booklet" })
        .getByRole("button", { name: /^Question 1: Answered, [01]\/1 marks$/ }),
    ).toBeVisible();
    // ⌘Enter checks the next one.
    await page.getByRole("button", { name: "Next question" }).click();
    await pick(page, "B");
    await page.keyboard.press("Control+Enter");
    await expect(
      page
        .getByRole("navigation", { name: "Question booklet" })
        .getByRole("button", { name: /^Question 2: Answered, [01]\/1 marks$/ }),
    ).toBeVisible();
  });

  for (const width of [390, 1280]) {
    test(`expiry stays editable with manual finish at ${width}px`, async ({
      page,
    }) => {
      test.skip(!adminClient(), "Needs a test database admin client");
      await page.setViewportSize({ width, height: 850 });
      const id = await setUp(page, []);
      await pick(page, "A");
      await expect(page.getByText("Saved", { exact: true })).toBeAttached();
      // No resume: simulate a lost tab (no finish beacon, no leave flag) so the
      // reload sees the server's elapsed time instead of ending the sprint.
      await page.route("**/api/sessions/*/finish", (route) => route.abort());
      await page.addInitScript(() => sessionStorage.clear());
      const { data: saved, error: readError } = await adminClient()!
        .from("sessions")
        .select("config")
        .eq("id", id)
        .single();
      expect(readError).toBeNull();
      const { error } = await adminClient()!
        .from("sessions")
        .update({
          elapsed_s: saved!.config.time_limit_s - 1,
          config: { ...saved!.config, on_timeout: "finish" },
        })
        .eq("id", id);
      expect(error).toBeNull();
      await page.reload();
      await page.unroute("**/api/sessions/*/finish");
      await expect(
        page.getByRole("alert").filter({ hasText: "Time’s up" }),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/student/sprint/${id}$`));
      await pick(page, "B");
      await page.getByRole("button", { name: "Next question" }).click();
      await expect(page.getByText(/^Question 3 ·/)).toBeVisible();
      await page
        .getByRole("button", { name: "Finish", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("dialog", { name: "Finish and mark?" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Keep working" }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Time’s up" }),
      ).toBeVisible();
    });
  }

  for (const width of [390, 1280]) {
    test(`flagging sits above the question at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await setUp(page, ["Check as I go"]);
      const actions = page.getByRole("group", { name: "Answer actions" });
      const flag = page.getByRole("button", { name: "Flag for review" });
      await expect(
        actions.getByRole("button", { name: "Check answer" }),
      ).toBeVisible();
      await flag.click();
      await expect(flag).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Next question" }).click();
      await page.getByRole("button", { name: "Previous question" }).click();
      await expect(flag).toHaveAttribute("aria-pressed", "true");
      await flag.click();
      await expect(flag).toHaveAttribute("aria-pressed", "false");
    });
  }

  for (const width of [390, 1280]) {
    test(`manual finish errors retain the saved answer at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.route("**/api/sessions/*/finish", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Could not finish your session. Try again.",
          }),
        }),
      );
      await setUp(page, []);
      await pick(page, "A");
      await page
        .getByRole("button", { name: "Finish", exact: true })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Finish and mark", exact: true })
        .click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Could not finish your session" }),
      ).toBeVisible();
      await expect(
        page.getByRole("radio", { name: /^Option A:/ }),
      ).toBeChecked();
      await pick(page, "B");
      await page
        .getByRole("button", { name: "Finish", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("dialog", { name: "Finish and mark?" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Keep working" }).click();
    });
  }

  test("old /practice session links redirect", async ({ page }) => {
    await page.goto(`/practice/${ids[0]}`);
    await expect(page).toHaveURL(/\/student\/(?:sprint|activity)\/[^/]+$/);
  });
});
