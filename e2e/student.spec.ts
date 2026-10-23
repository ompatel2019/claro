import { test, expect } from "@playwright/test";
import path from "node:path";
test.describe.configure({ mode: "serial" });
import {
  adminClient,
  signIn,
  start,
  finish,
  cleanupSessions,
  pick,
} from "./helpers";
test.describe("Student practice", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !process.env.STUDENT_PASSWORD,
    "Requires a real student account",
  );
  test.describe.configure({ mode: "serial" });
  const ids: string[] = [];
  let finishedId = "";
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });
  test("sign in, dashboard and sign out", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in(\?|$)/);
  });
  test("multiple choice sprint, flag and results", async ({ page }) => {
    finishedId = await start(page, "Multiple choice", ids);
    const nav = page.getByRole("navigation", { name: "Question booklet" });
    const count = await nav.getByRole("button").count();
    const flag = page.getByRole("button", {
      name: "Flag for review",
      exact: true,
    });
    await expect(flag).toHaveAttribute("aria-pressed", "false");
    await flag.click();
    await expect(flag).toHaveAttribute("aria-pressed", "true");
    for (let i = 0; i < count; i++) {
      await pick(page, "A");
      if (i < count - 1)
        await page.getByRole("button", { name: "Next question" }).click();
    }
    await finish(page);
    await expect(
      page.getByRole("heading", { name: /sprint · / }),
    ).toBeVisible();
    await expect(page.getByText("Score", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/^Your answer: A · Correct: [ABCD]$/).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Your answer", { exact: true }).first(),
    ).toBeVisible();
  });
  test("exit asks first and ends the sprint (no resume)", async ({ page }) => {
    const id = await start(page, "Multiple choice", ids);
    await pick(page, "A");
    await page.getByRole("button", { name: "Exit sprint" }).click();
    const dialog = page.getByRole("alertdialog", {
      name: "Leave this sprint?",
    });
    await expect(dialog).toContainText(
      "Leaving ends this sprint. Your answered questions will be marked.",
    );
    await dialog.getByRole("button", { name: "Leave and mark" }).click();
    await expect(page).toHaveURL(new RegExp(`/student/activity/${id}$`));
    await page.goto(`/student/sprint/${id}`);
    await expect(page).toHaveURL(new RegExp(`/student/activity/${id}$`));
  });
  test("activity kind filter links to the finished sprint", async ({
    page,
  }) => {
    await page.goto("/student/activity");
    await page.getByRole("button", { name: /^Sprints ·/ }).click();
    await expect(page).toHaveURL(/kind=sprint/);
    await page
      .locator(`a[href="/student/activity/${finishedId}"]`)
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: /sprint · / }),
    ).toBeVisible();
  });
});

test.describe("AI backed written practice", () => {
  test.skip(
    !process.env.E2E_AI || !process.env.STUDENT_EMAIL,
    "Calls OpenAI: set E2E_AI=1 with a real student account",
  );
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180000);
  const ids: string[] = [];
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test("typed answer is marked with a band and highlighted comments", async ({
    page,
  }) => {
    const id = await start(page, "Short answer", ids);
    // Pin this run's sprint to one question the fixed answer fits, so it can't
    // score 0 (no Band line) on a random calculation question.
    const db = adminClient()!;
    const { data: first, error } = await db
      .from("attempts")
      .select("id")
      .eq("session_id", id)
      .order("position")
      .limit(1)
      .single();
    if (error) throw error;
    await db
      .from("attempts")
      .delete()
      .eq("session_id", id)
      .neq("id", first.id)
      .throwOnError();
    await db
      .from("attempts")
      .update({ question_id: "2024-q22a" }) // Outline ONE cause of inflation in Australia. (2)
      .eq("id", first.id)
      .throwOnError();
    // No resume: a real reload ends the sprint, so simulate a lost tab instead.
    await page.route("**/api/sessions/*/finish", (route) => route.abort());
    await page.addInitScript(() => sessionStorage.clear());
    await page.reload();
    await page.unroute("**/api/sessions/*/finish");
    await expect(
      page.getByText("Outline ONE cause of inflation in Australia."),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Your answer" })
      .fill(
        "Demand-pull inflation occurs when aggregate demand rises faster than the economy’s productive capacity. Higher household consumption, investment or government spending increases competition for scarce goods and services, pushing up the general price level. Inflation reduces the purchasing power of households on fixed incomes, lowering their real income. It can also reduce international competitiveness as Australian export prices rise relative to overseas goods, weakening export demand and worsening the current account balance.",
      );
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      page.getByText("Submitted, marking in the background", { exact: true }),
    ).toBeVisible();
    await finish(page);
    await expect(page.getByText(/^Band:/)).toBeVisible({ timeout: 90000 });
    await expect(page.locator("mark").first()).toBeVisible();
    await expect(page.getByText("How to reach full marks")).toBeVisible();
  });
  test("photo transcription can be edited and confirmed without grading", async ({
    page,
  }) => {
    await start(page, "Short answer", ids);
    await page
      .getByLabel("Take photo / Upload", { exact: true })
      .setInputFiles(path.join(process.cwd(), "e2e/fixtures/answer.jpg"));
    const transcript = page.getByRole("textbox", {
      name: "Check your transcript",
    });
    await expect(transcript).toBeVisible({ timeout: 90000 });
    await expect(transcript).not.toHaveValue("");
    await transcript.fill(
      (await transcript.inputValue()) + "\nHigher demand pushes prices up.",
    );
    await page
      .getByRole("button", { name: "Confirm transcript", exact: true })
      .click();
    await expect(page.getByText("Transcript confirmed.")).toBeVisible();
    await page.getByRole("button", { name: "Exit sprint" }).click();
    await page
      .getByRole("alertdialog", { name: "Leave this sprint?" })
      .getByRole("button", { name: "Leave and mark" })
      .click();
    await expect(page).toHaveURL(/\/student\/activity\//);
  });
});
