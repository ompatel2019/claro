import { expect, test } from "@playwright/test";
import { adminClient, cleanupSessions, signIn } from "./helpers";

// Also works when the setup wizard is present after lane2's changes.
async function timerStep(page: import("@playwright/test").Page) {
  const pace = page.getByLabel("Multis: minutes per question");
  for (let step = 0; step < 4 && !(await pace.isVisible()); step++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(pace).toBeVisible();
}
for (const width of [390, 1280]) {
  test.describe(`Sprint pace ${width}px`, () => {
    test.skip(!process.env.STUDENT_EMAIL, "Needs a synthetic student account");
    const ids: string[] = [];
    test.afterAll(async () => cleanupSessions(ids));
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await signIn(page);
    });
    test("defaults, validation, live summary and saved MC timer", async ({
      page,
    }) => {
      await page.goto("/student/sprint?type=mcq&size=5");
      await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
      await timerStep(page);
      const multis = page.getByLabel("Multis: minutes per question");
      const shorts = page.getByLabel("Shorts: minutes per mark");
      await expect(multis).toHaveValue("1");
      await expect(shorts).toHaveValue("1.5");
      await expect(page.getByRole("radio", { name: "HSC pace" })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("radio", { name: "Finish and mark automatically" }),
      ).toHaveCount(0);
      const start = page.getByRole("button", { name: /^Start (sprint|with)/ });
      await multis.fill("0");
      await expect(multis).toHaveAttribute("aria-invalid", "true");
      await expect(start).toBeDisabled();
      await multis.blur();
      await expect(multis).toHaveValue("0.25");
      await multis.fill("11");
      await multis.blur();
      await expect(multis).toHaveValue("10");
      await multis.fill("");
      await expect(start).toBeDisabled();
      await multis.fill("2");
      await expect(page.getByText("≈ 10 min", { exact: true })).toBeVisible();
      await start.click();
      await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
      const id = page.url().split("/").at(-1)!;
      ids.push(id);
      const { data, error } = await adminClient()!
        .from("sessions")
        .select("config")
        .eq("id", id)
        .single();
      expect(error).toBeNull();
      expect(data!.config.time_limit_s).toBe(
        data!.config.actual_questions * 120,
      );
      expect(data!.config.mcq_min_per_q).toBe(2);
      expect(data!.config.on_timeout).toBe("overtime");
      expect(data!.config).not.toHaveProperty("pace");
    });
    test("empty pool and count errors preserve pace settings", async ({
      page,
    }) => {
      let fail = false;
      await page.route("**/rest/v1/rpc/sprint_pool", async (route) => {
        await route.fulfill({
          status: fail ? 503 : 200,
          contentType: "application/json",
          body: JSON.stringify(
            fail
              ? { message: "Synthetic count error" }
              : {
                  questions: 0,
                  marks: 0,
                  any: 0,
                  new: 0,
                  mistakes: 0,
                  flagged: 0,
                  topics: {},
                  subtopics: {},
                  all_subtopics: 0,
                  verbs: {},
                  difficulty: {},
                  all_years: 0,
                  years: [2018, 2025],
                  trial: false,
                },
          ),
        });
      });
      await page.goto("/student/sprint?type=mcq&size=5");
      await expect(
        page.getByText("No questions match", { exact: true }),
      ).toBeVisible();
      await timerStep(page);
      const multis = page.getByLabel("Multis: minutes per question");
      await multis.fill("2");
      await expect(
        page.getByRole("button", { name: /^Start (sprint|with)/ }),
      ).toBeDisabled();
      fail = true;
      await multis.fill("3");
      await expect(
        page.getByText("Couldn't count matching questions."),
      ).toBeVisible();
      await expect(multis).toHaveValue("3");
    });

    test("short timer uses actual marks; untimed hides pace", async ({
      page,
    }) => {
      await page.goto("/student/sprint?type=short&size=10");
      await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
      await timerStep(page);
      await page.getByLabel("Shorts: minutes per mark").fill("");
      await page.getByRole("switch", { name: "Timed", exact: true }).click();
      await expect(page.getByLabel("Shorts: minutes per mark")).toBeHidden();
      await expect(page.getByText(/Untimed · Whole course/)).toBeVisible();
      await page.getByRole("switch", { name: "Timed", exact: true }).click();
      await page.getByLabel("Shorts: minutes per mark").fill("2.25");
      await page.getByRole("button", { name: /^Start (sprint|with)/ }).click();
      await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
      const id = page.url().split("/").at(-1)!;
      ids.push(id);
      const { data, error } = await adminClient()!
        .from("sessions")
        .select("config")
        .eq("id", id)
        .single();
      expect(error).toBeNull();
      expect(data!.config.time_limit_s).toBe(data!.config.actual_marks * 135);
    });
  });
}
