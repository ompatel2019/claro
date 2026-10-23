import { expect, test } from "@playwright/test";
import { adminClient, cleanupSessions, signIn, start } from "./helpers";

const answer =
  "Inflation rose because demand grew faster than supply.\nWages lagg[?] behind prices.";
const comments = [
  {
    quote: "Inflation rose",
    start: 0,
    kind: "fix",
    tag: "Evidence",
    body: "Give a CPI figure.",
    next_mark: "Quote the latest CPI rate.",
  },
  {
    quote: "demand grew faster than supply",
    start: 23,
    kind: "strength",
    tag: "Knowledge",
    body: "Correct cause of demand-pull inflation.",
    next_mark: null,
  },
  {
    quote: "",
    start: null,
    kind: "fix",
    tag: "Structure",
    body: "End with a one-line judgement.",
    next_mark: null,
  },
];

test.describe("annotated written feedback", () => {
  test.skip(
    !process.env.STUDENT_EMAIL || !adminClient(),
    "Needs a student account and the service key to seed a marked answer",
  );
  test.describe.configure({ mode: "serial" });
  const ids: string[] = [];
  const reports: { id: string; screenshots: string[] }[] = [];
  let results = "";
  let attemptId = "";
  test.afterAll(async () => {
    const db = adminClient()!;
    for (const r of reports) {
      if (r.screenshots.length)
        await db.storage.from("reports").remove(r.screenshots);
      await db.from("feedback").delete().eq("id", r.id);
    }
    await cleanupSessions(ids);
  });

  test("seed a finished sprint with a marked written answer", async ({
    page,
  }) => {
    await signIn(page);
    const id = await start(page, "Short answer", ids);
    // Seed the marking directly so nothing calls OpenAI: the first answer
    // is marked, the rest skipped, and the session is finished in the DB.
    const db = adminClient()!;
    const { data: attempts } = await db
      .from("attempts")
      .select("id,position")
      .eq("session_id", id)
      .order("position");
    const [first, ...rest] = attempts!;
    attemptId = first.id;
    const skipped = await db
      .from("attempts")
      .update({ status: "skipped" })
      .in(
        "id",
        rest.map((a) => a.id),
      );
    const marked = await db
      .from("attempts")
      .update({
        status: "marked",
        check_status: "skipped",
        answer_text: answer,
        mark: 2,
        max_marks: 4,
        feedback: { comments, better_answer_outline: ["State a cause."] },
      })
      .eq("id", first.id);
    const finished = await db
      .from("sessions")
      .update({ finished_at: new Date().toISOString(), score: 2, max_score: 4 })
      .eq("id", id);
    expect([skipped.error, marked.error, finished.error]).toEqual([
      null,
      null,
      null,
    ]);
    results = `/student/activity/${id}`;
  });

  test("highlights and the comment column link both ways on wide screens", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1700, height: 1000 });
    await signIn(page);
    await page.goto(results);
    const score = page.getByRole("complementary", { name: "Your mark: 2/4" });
    await expect(score).toContainText("2/4 marks");
    // Sprint results: no "Marked" chip on the marks card.
    await expect(score.getByText("Marked", { exact: true })).toHaveCount(0);
    const column = page.getByRole("region", { name: "Comments", exact: true });
    const card = (id: number) => column.locator(`[data-card="${id}"]`);
    // Every comment at once, no slider.
    await expect(column.locator("[data-card]")).toHaveCount(3);
    await expect(
      column.getByRole("button", { name: "Next comment" }),
    ).toHaveCount(0);
    await expect(card(0)).toContainText(
      "Your next mark: Quote the latest CPI rate.",
    );
    await expect(card(2).getByText("Overall", { exact: true })).toBeVisible();
    const fix = page.getByRole("button", {
      name: "Fix 1, Evidence: Give a CPI figure.",
    });
    await expect(fix).toHaveText("Inflation rose");
    await expect(fix).toHaveClass(/cma-hl--missed/);
    await expect(fix).toHaveAttribute("data-anchors", "0");
    await expect(page.locator(".cma-text > p")).toHaveText([
      "Inflation rose because demand grew faster than supply.",
      "Wages lagg[?] behind prices.",
    ]);
    await expect(
      page.getByTitle("Hard to read. Not counted against you."),
    ).toHaveText("lagg[?]");
    // The column sits to the right of the answer, joined by connector lines.
    const [h, c] = await Promise.all([
      fix.boundingBox(),
      card(0).boundingBox(),
    ]);
    expect(c!.x).toBeGreaterThan(h!.x + h!.width);
    await expect(page.locator("svg.cma-lines")).toBeVisible();
    // Keyboard: Enter on a highlight focuses its comment, dims the rest, no scroll.
    const y = await page.evaluate(() => window.scrollY);
    await fix.press("Enter");
    await expect(card(0)).toBeFocused();
    await expect(card(0)).toHaveAttribute("aria-pressed", "true");
    await expect(card(1)).toHaveAttribute("data-dim", "true");
    await expect(fix).toHaveAttribute("data-selected", "true");
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
    // Selecting a comment lights its phrase.
    await card(1).click();
    const strength = page.getByRole("button", { name: /^Strength 2/ });
    await expect(strength).toHaveClass(/cma-hl--earned/);
    await expect(strength).toHaveAttribute("data-selected", "true");
    await expect(fix).not.toHaveAttribute("data-selected", "true");
    await expect(card(0)).toHaveAttribute("data-dim", "true");
    await score
      .getByRole("button", {
        name: "Your next mark: Quote the latest CPI rate.",
      })
      .click();
    await expect(card(0)).toBeFocused();
    await expect(fix).toHaveAttribute("data-selected", "true");
  });

  test("on phones the comments stack under the answer and a highlight focuses its comment", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signIn(page);
    await page.goto(results);
    const strength = page.getByRole("button", { name: /^Strength 2/ });
    await strength.click();
    const column = page.getByRole("region", { name: "Comments", exact: true });
    const card = column.locator('[data-card="1"]');
    await expect(card).toContainText("Correct cause of demand-pull inflation.");
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(strength).toHaveAttribute("data-selected", "true");
    const [s, c] = await Promise.all([
      strength.boundingBox(),
      card.boundingBox(),
    ]);
    expect(c!.y).toBeGreaterThan(s!.y);
    await expect(page.locator("svg.cma-lines")).toBeHidden();
  });

  test("report a problem with this question sends linked feedback", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(results);
    await page
      .getByRole("button", { name: "Report a problem with this question" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/^Linked: /)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Content error" }),
    ).toHaveAttribute("aria-pressed", "true");
    const message = `E2E report ${Date.now()}`;
    await dialog.getByRole("textbox", { name: "Message" }).fill(message);
    await dialog
      .getByLabel("Add screenshots")
      .setInputFiles("e2e/fixtures/answer.jpg");
    await expect(dialog.getByRole("img", { name: "answer.jpg" })).toBeVisible();
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(
      page.getByText("Thanks. We read every message."),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    const { data } = await adminClient()!
      .from("feedback")
      .select("id,kind,question_id,session_id,screenshots,page_path")
      .eq("message", message)
      .single();
    reports.push(data!);
    expect(data).toMatchObject({
      kind: "content",
      session_id: ids[0],
      page_path: results,
    });
    expect(data!.question_id).toBeTruthy();
    expect(data!.screenshots).toHaveLength(1);
  });

  test("the account menu opens general feedback on any student page", async ({
    page,
  }) => {
    await signIn(page);
    await page
      .getByRole("button", { name: /^(Account|User) menu$/ })
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByRole("menuitem", { name: "Send feedback", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "General" }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("question this mark puts the answer under review", async ({ page }) => {
    await signIn(page);
    await page.goto(results);
    await page.getByRole("button", { name: "Question this mark" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(
        "Our team will re-check your answer. Your mark can go up or down.",
      ),
    ).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "What do you think we missed?" })
      .fill("I explained the cause with a CPI figure in my second sentence.");
    await dialog.getByRole("button", { name: "Submit" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Being double-checked").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Question this mark" }),
    ).toHaveCount(0);
    const again = await page.request.post(
      `/api/attempts/${attemptId}/dispute`,
      {
        data: { note: "Another go at questioning this." },
      },
    );
    expect(again.status()).toBe(409);
    const { data } = await adminClient()!
      .from("attempts")
      .select("check_status, mark_reviews(reason, status, ai_mark)")
      .eq("id", attemptId)
      .single();
    expect(data).toMatchObject({
      check_status: "in_review",
      mark_reviews: [{ reason: "student_dispute", status: "open", ai_mark: 2 }],
    });
  });
});
