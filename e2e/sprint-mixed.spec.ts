import { expect, test } from "@playwright/test";
import {
  adminClient,
  cleanupSessions,
  reviewSprintSetup,
  signIn,
} from "./helpers";
import { seedSprintBank, sprintStudentClient } from "./fixtures/sprint-bank";

for (const width of [400, 1280]) {
  test.describe(`Mixed sprint ${width}px`, () => {
    test.skip(
      !process.env.STUDENT_EMAIL || !adminClient(),
      "Needs a synthetic student and bank fixture access",
    );
    let bank: Awaited<ReturnType<typeof seedSprintBank>>;
    const ids: string[] = [];
    test.beforeAll(async () => {
      bank = await seedSprintBank();
    });
    test.afterAll(async () => {
      await cleanupSessions(ids);
      await bank?.cleanup();
    });
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page, "/student/sprint");
    });
    test("independent question buckets, invalid input, reload, exact selection and MC-first order", async ({
      page,
    }) => {
      await page.goto(
        `/student/sprint?type=mixed&sub=${bank.subtopic}&size=20`,
      );
      await reviewSprintSetup(page);
      const mc = page.getByRole("spinbutton", {
        name: "Multiple choice questions",
      });
      const shorts = page.getByRole("spinbutton", {
        name: "Short answer questions",
      });
      await expect(mc).toHaveValue("14");
      await expect(shorts).toHaveValue("6");
      await mc.fill("999");
      await mc.blur();
      await expect(mc).toHaveValue("40");
      await expect(shorts).toHaveValue("6");
      await shorts.fill("-1");
      await shorts.blur();
      await expect(shorts).toHaveValue("0");
      await shorts.fill("2");
      await shorts.blur();
      await mc.fill("11");
      await mc.blur();
      await expect(shorts).toHaveValue("2");
      await page.goto("/student/sprint");
      await reviewSprintSetup(page);
      await expect(mc).toHaveValue("11");
      await expect(shorts).toHaveValue("2");
      await page.screenshot({
        path: test.info().outputPath("mixed-size.png"),
        fullPage: true,
      });
      await expect(
        page.locator("form").filter({
          has: page.getByRole("button", { name: /^Start (sprint|with)/ }),
        }),
      ).toContainText("11 multis + 2 shorts");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: /^Start (sprint|with)/ }).click();
      await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
      const id = page.url().split("/").at(-1)!;
      ids.push(id);
      await expect(page.getByText("Q 1 of 13")).toBeVisible();
      const db = adminClient()!;
      const { data: rows, error } = await db
        .from("attempts")
        .select("position,question:questions(type,marks)")
        .eq("session_id", id)
        .order("position");
      expect(error).toBeNull();
      const questions = rows!.map(
        (row) => row.question as unknown as { type: string; marks: number },
      );
      expect(questions.filter((q) => q.type === "mcq")).toHaveLength(11);
      expect(questions.filter((q) => q.type === "short")).toHaveLength(2);
      expect(questions.map((q) => q.type)).toEqual([
        ...Array(11).fill("mcq"),
        "short",
        "short",
      ]);
    });
    test("zero buckets, limited pools and errors never substitute the other type", async ({
      page,
    }) => {
      await page.goto(
        `/student/sprint?type=mixed&sub=${bank.subtopic}&size=20`,
      );
      await reviewSprintSetup(page);
      await page
        .getByRole("spinbutton", { name: "Multiple choice questions" })
        .fill("20");
      await page
        .getByRole("spinbutton", { name: "Multiple choice questions" })
        .blur();
      await expect(
        page.getByText(/Only 12 multis and 3 short-answer questions match/),
      ).toBeVisible();
      const db = await sprintStudentClient();
      const config = {
        mode: "mixed",
        size_by: "marks",
        target: 20,
        topics: ["t1"],
        subtopics: [bank.subtopic],
        timed: false,
        order: "shuffled",
        include_extended: true,
      };
      for (const [
        mcq_count,
        short_marks,
        actual_mcq_count,
        actual_short_marks,
      ] of [
        [20, 0, 12, 0],
        [0, 20, 0, 17],
        [10, 10, 10, 9],
        [13, 7, 12, 8],
      ]) {
        const { data: id, error } = await db.rpc("start_sprint", {
          p_config: { ...config, mcq_count, short_marks },
        });
        expect(error).toBeNull();
        ids.push(id);
        const { data: session } = await adminClient()!
          .from("sessions")
          .select("config")
          .eq("id", id)
          .single();
        expect(session!.config).toMatchObject({
          mcq_count,
          short_marks,
          actual_mcq_count,
          actual_short_marks,
          order: "exam",
        });
      }
      for (const patch of [
        { mcq_count: -1, short_marks: 21 },
        { mcq_count: 11, short_marks: 11 },
        { mcq_count: 1.5, short_marks: 18.5 },
        { history: "flagged", mcq_count: 10, short_marks: 10 },
      ]) {
        const { error } = await db.rpc("start_sprint", {
          p_config: { ...config, ...patch },
        });
        expect(error).not.toBeNull();
      }
    });
  });
}
