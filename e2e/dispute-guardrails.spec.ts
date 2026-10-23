import { expect, test } from "@playwright/test";
import { adminClient, signIn, signInAdmin } from "./helpers";
import { disputeStudent } from "./fixtures/dispute-student";

test.describe("student marking disputes", () => {
  test.skip(
    !adminClient() || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    "Needs service credentials and an admin account",
  );
  test.describe.configure({ mode: "serial" });
  let fixture: Awaited<ReturnType<typeof disputeStudent>>;
  test.beforeEach(async () => {
    fixture = await disputeStudent();
  });
  test.afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });
  for (const width of [400, 1280]) {
    test(`results entry, reason validation, review history and repeated requests at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, fixture.email, fixture.password);
      await page.goto(`/student/activity/${fixture.sessions[0]}`);
      await page
        .getByRole("button", { name: "Question this mark", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Question this mark" });
      await expect(dialog).toContainText("up to 5 per Sydney week");
      const submit = dialog.getByRole("button", {
        name: "Submit",
        exact: true,
      });
      await expect(submit).toBeDisabled();
      await dialog.getByRole("textbox").fill("          ");
      await expect(submit).toBeDisabled();
      await dialog
        .getByRole("textbox")
        .fill("Please check the explanation in my answer.");
      await submit.click();
      await expect(dialog).toBeHidden();
      const url = `/api/attempts/${fixture.attempts[0]}/dispute`;
      const duplicate = await page.request.post(url, {
        data: { note: "Please check my answer again." },
      });
      expect(duplicate.status()).toBe(409);
      await expect(
        page.getByRole("button", { name: "Question this mark", exact: true }),
      ).toHaveCount(0);
      await page.goto("/sign-in");
      // Use a separate browser context for the administrator.
      const context = await page
        .context()
        .browser()!
        .newContext({ viewport: { width, height: 900 } });
      const adminPage = await context.newPage();
      try {
        await signInAdmin(adminPage);
        await adminPage.goto("/admin/marking/review?reason=student_dispute");
        await expect(
          adminPage.getByRole("link", { name: "finished session results" }),
        ).toHaveAttribute("href", "/student/activity");
        const row = adminPage.getByRole("row").filter({
          has: adminPage.locator(`a[href="/admin/students/${fixture.userId}"]`),
        });
        await expect(row).toContainText("1 total · 1 open");
        await expect(row).toContainText("No resolved disputes");
      } finally {
        await context.close();
      }
    });
  }
  test("atomic open cap, weekly cap, cooldown and foreign/invalid attempts", async ({
    page,
  }) => {
    await signIn(page, fixture.email, fixture.password);
    const request = (id: string, note = "Please check my evidence.") =>
      page.request.post(`/api/attempts/${id}/dispute`, { data: { note } });
    expect((await request(fixture.attempts[0], "short")).status()).toBe(400);
    expect(
      (await request("00000000-0000-4000-8000-000000000001")).status(),
    ).toBe(404);
    const db = adminClient()!;
    await db
      .from("attempts")
      .update({ status: "pending" })
      .eq("id", fixture.attempts[8])
      .throwOnError();
    expect((await request(fixture.attempts[8])).status()).toBe(409);
    await db
      .from("attempts")
      .update({ status: "marked" })
      .eq("id", fixture.attempts[8])
      .throwOnError();
    await db
      .from("sessions")
      .update({ finished_at: null })
      .eq("id", fixture.sessions[8])
      .throwOnError();
    expect((await request(fixture.attempts[8])).status()).toBe(409);
    await db
      .from("sessions")
      .update({ finished_at: new Date().toISOString() })
      .eq("id", fixture.sessions[8])
      .throwOnError();
    const foreign = await disputeStudent(1);
    try {
      expect((await request(foreign.attempts[0])).status()).toBe(404);
    } finally {
      await foreign.cleanup();
    }
    const concurrent = await Promise.all(
      fixture.attempts.slice(0, 4).map((id) => request(id)),
    );
    expect(concurrent.map((r) => r.status()).sort()).toEqual([
      200, 200, 200, 429,
    ]);
    await db
      .from("mark_reviews")
      .update({
        status: "resolved",
        final_mark: 2,
        resolved_at: new Date().toISOString(),
      })
      .eq("user_id", fixture.userId)
      .throwOnError();
    await db
      .from("attempts")
      .update({ check_status: "reviewed" })
      .in("id", fixture.attempts)
      .throwOnError();
    for (const id of fixture.attempts.slice(4, 6))
      expect((await request(id)).status()).toBe(200);
    const weekly = await request(fixture.attempts[6]);
    expect(weekly.status()).toBe(429);
    expect((await weekly.json()).error).toContain("Sydney week");
    await db
      .from("mark_reviews")
      .update({
        created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
        status: "resolved",
        final_mark: 1,
        resolved_at: new Date().toISOString(),
      })
      .eq("user_id", fixture.userId)
      .throwOnError();
    const cooldown = await request(fixture.attempts[6]);
    expect(cooldown.status()).toBe(429);
    expect((await cooldown.json()).error).toContain("48 hours");
    await db
      .from("mark_reviews")
      .update({
        resolved_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      })
      .eq("user_id", fixture.userId)
      .throwOnError();
    expect((await request(fixture.attempts[6])).status()).toBe(200);
  });
  test("request failure stays in the dialog and can be retried", async ({
    page,
  }) => {
    await signIn(page, fixture.email, fixture.password);
    await page.goto(`/student/activity/${fixture.sessions[0]}`);
    await page
      .getByRole("button", { name: "Question this mark", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("textbox")
      .fill("Please check my evidence.");
    await page.route("**/api/attempts/*/dispute", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Couldn't request a review. Try again." },
      }),
    );
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Couldn't request a review",
    );
    await expect(
      page.getByRole("button", { name: "Submit", exact: true }),
    ).toBeEnabled();
  });
});
