import { expect, test, type Page } from "@playwright/test";
import {
  cleanupSessions,
  expectNoOverlap,
  expectStackedBelow,
  signIn,
} from "./helpers";

async function reviewSprintSetup(page: Page) {
  const custom = page.getByRole("button", { name: "Custom", exact: true });
  if ((await custom.getAttribute("aria-pressed")) !== "true")
    await custom.click();
}

test.describe("Topic Sprint setup", () => {
  test.skip(!process.env.STUDENT_EMAIL, "Needs a student account");
  const ids: string[] = [];
  test.afterAll(async () => {
    await cleanupSessions(ids);
  });
  test.beforeEach(async ({ page }) => {
    await signIn(page, "/student/sprint");
  });

  for (const width of [390, 1280]) {
    test(`${width}px summary stays in flow below the step card`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(
        "/student/sprint?type=short&sub=t3-inflation&size=90&history=new_only",
      );
      const start = page.getByRole("button", { name: /^Start (sprint|with)/ });
      const bar = page.locator("form").filter({ has: start });
      const card = page.locator('[data-slot="card"]').filter({
        has: page.getByRole("region", { name: "Question type", exact: true }),
      });
      await expect(bar.getByText(/^\d+ questions match/)).toBeVisible();
      await expect(bar.getByRole("alert")).toContainText(
        /Only \d+ marks match/,
      );
      await expect(bar).toContainText("Economic Issues (Inflation)");
      await expect(bar).toHaveCSS("position", "static");
      if (width < 1280) await expectStackedBelow(card, bar);
      await expectNoOverlap(card, bar);
      await expect(start).toBeEnabled();
    });
  }

  test("400px controls clear feedback and the summary at page end", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto("/student/sprint?type=mcq&sub=t4-fiscal&size=5");
    const start = page.getByRole("button", { name: /^Start (sprint|with)/ });
    const bar = page.locator("form").filter({ has: start });
    await expect(bar.getByText(/^\d+ questions match/)).toBeVisible();
    await expect(
      page.locator('button.fixed[aria-label="Feedback"]'),
    ).toBeHidden();
    await expect(
      page
        .locator("header")
        .getByRole("button", { name: "Feedback", exact: true }),
    ).toBeVisible();

    const summary = bar.locator("dl");
    await expect(bar).toContainText("Economic Policies and Management");
    await expect
      .poll(() =>
        Promise.all([bar.boundingBox(), summary.boundingBox()]).then(
          ([outer, inner]) => outer!.width - inner!.width,
        ),
      )
      .toBeLessThanOrEqual(48);
    await expectStackedBelow(
      summary,
      bar.getByRole("button", { name: "Reset", exact: true }),
    );
    await expectStackedBelow(summary, start);
    const chip = page.getByRole("button", {
      name: /^National and global context for environmental management/,
    });
    await expect(chip).toHaveCount(1);
    await expect
      .poll(() =>
        chip.evaluate(
          (element) =>
            document.documentElement.clientWidth -
            element.getBoundingClientRect().right,
        ),
      )
      .toBeGreaterThanOrEqual(0);

    // A shared account can have someone else's unfinished sprint. Leave it alone.
    const resume = page.getByRole("link", { name: "Continue", exact: true });
    if (await resume.count()) {
      const text = page.getByText(/^You have an unfinished/);
      await expectStackedBelow(text, resume);
    }

    const topic = page.getByRole("button", {
      name: /^Economic Policies and Management/,
    });
    await topic.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await expect(topic).toBeInViewport({ ratio: 1 });
    await expectNoOverlap(bar, topic);
    await reviewSprintSetup(page);
    await page.getByRole("button", { name: "Advanced" }).click();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const last = page.locator("label").filter({
      has: page.getByRole("radio", {
        name: "Check as I go",
      }),
    });
    await expect(last).toBeInViewport({ ratio: 1 });
    await expectNoOverlap(bar, last);
    await expect(start).toBeInViewport({ ratio: 1 });
  });

  test("filters update the live pool and summary; topics cap at two", async ({
    page,
  }) => {
    await page.goto("/student/sprint");
    const bar = page.locator("form").filter({ hasText: "questions match" });
    await expect(
      bar.getByText(/^\d+ questions match · \d+ new$/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Short answer", exact: true })
      .click();
    const subs = page.getByRole("group", { name: "Economic Issues subtopics" });
    await subs.getByRole("button", { name: /^Inflation \d+$/ }).click();
    // The year span follows the published content (HSC and A1 practice), so it is not pinned.
    await expect(bar).toContainText(
      /30 marks · 45 min · Economic Issues \(Inflation\) · \d{4}–\d{4} · Prefer new/,
    );
    // Inflation alone has fewer than 30 short-answer marks: the shortfall is explicit.
    await expect(
      page.getByRole("alert").filter({ hasText: /^Only \d+ marks match/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Start with \d+ marks$/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^The Global Economy/ }).click();
    await page.getByRole("button", { name: /^Economic Policies/ }).click();
    await expect(
      page.getByText("Up to 2 topics. Deselect one first."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Economic Policies/ }),
    ).toHaveAttribute("aria-pressed", "false");
    await reviewSprintSetup(page);
    await page.getByRole("button", { name: "Advanced" }).click();
    const to = Number(
      await page.getByRole("combobox", { name: "To year" }).textContent(),
    );
    await page.getByRole("combobox", { name: "From year" }).click();
    await page
      .getByRole("option", { name: String(to - 4), exact: true })
      .click();
    await expect(page.getByText("1 filter on")).toBeVisible();
    await page.getByText("Adjust exam pace", { exact: true }).click();
    await page.getByLabel("Shorts: minutes per mark").fill("2.25");
    await expect(page.getByText("≈ 68 min")).toBeVisible();
    await page.getByRole("switch", { name: /Timed at exam pace/ }).click();
    await expect(bar).toContainText("Untimed");
    // The setup is remembered.
    await page.reload();
    await expect(bar).toContainText("Untimed");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(bar).toContainText(
      "20 questions · 20 marks · 20 min · Whole course",
    );
  });

  test("Source chips are HSC papers and Practice, and their counts add up", async ({
    page,
  }) => {
    await page.goto("/student/sprint?type=mcq");
    const match = page.getByText(/^\d+ questions match/).first();
    const count = async () =>
      Number((await match.textContent())!.match(/^(\d+)/)![1]);
    await expect(match).toBeVisible();
    await reviewSprintSetup(page);
    await page.getByRole("button", { name: "Advanced" }).click();
    const source = page.getByRole("group", { name: "Source" });
    await expect(
      source.getByRole("button", { name: "HSC papers" }),
    ).toBeVisible();
    await expect(
      source.getByRole("button", { name: "Practice" }),
    ).toBeVisible();
    await expect(page.getByText("Trial papers")).toHaveCount(0);
    const both = await count();
    await source.getByRole("button", { name: "Practice" }).click();
    await expect.poll(count).toBeLessThan(both);
    const hsc = await count();
    await source.getByRole("button", { name: "Practice" }).click();
    await source.getByRole("button", { name: "HSC papers" }).click();
    // Practice only: the pool moves away from the HSC-only count before it is read.
    await expect.poll(count).not.toBe(hsc);
    const practice = await count();
    expect(hsc + practice).toBe(both);
    await page.getByRole("button", { name: "Reset" }).click();
  });

  test("a prefilled link starts a sized, timed sprint in exam order", async ({
    page,
  }) => {
    await page.goto("/student/sprint?type=mcq&sub=t3-inflation&size=5");
    await expect(page.getByText("Prefilled from a link.")).toBeVisible();
    await reviewSprintSetup(page);
    await expect(page.getByRole("textbox", { name: "Questions" })).toHaveValue(
      "5",
    );
    await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
    await reviewSprintSetup(page);
    await page.keyboard.press("Control+Enter");
    await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
    ids.push(page.url().split("/").at(-1)!);
    await expect(page.getByText(/^Question 1 of 5/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Time remaining 4:5\d$/ }),
    ).toBeVisible();
    // The setup page offers to continue an unfinished sprint. Other runs share
    // the account, so the banner may point at a different one: resume ours by id.
    await page.goto("/student/sprint");
    await expect(page.getByRole("link", { name: "Continue" })).toHaveAttribute(
      "href",
      /\/student\/sprint\/[^/]+$/,
    );
    await page.goto(`/student/sprint/${ids.at(-1)}`);
    await expect(page.getByText(/^Question 1 of 5/)).toBeVisible();
  });

  test("no matches offers one-click fixes with counts", async ({ page }) => {
    await page.goto(
      "/student/sprint?type=short&sub=t3-external-stability&history=flagged",
    );
    await expect(page.getByText("No questions match")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Start/ })).toBeDisabled();
    await page
      .getByRole("button", { name: /^Include seen questions \(\+\d+\)$/ })
      .click();
    await expect(page.getByText("No questions match")).toHaveCount(0);
    await reviewSprintSetup(page);
    await page.getByRole("button", { name: "Advanced" }).click();
    await expect(page.getByRole("radio", { name: /^Any/ })).toBeChecked();
  });

  test("the old /practice link redirects to the setup page", async ({
    page,
  }) => {
    await page.goto("/practice?topics=t3");
    await expect(page).toHaveURL(/\/student\/sprint\?topics=t3$/);
    await expect(
      page.getByRole("button", { name: /^Economic Issues/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

// Real setup component, synthetic pool/actions: no accounts, DB writes or marking.
test.describe("Iteration 2 setup without services", () => {
  let setup: string;
  test.beforeAll(async () => {
    const { build } = await import("esbuild");
    const result = await build({
      stdin: {
        contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
          import {SprintSetup} from './src/components/sprint-setup';
          createRoot(document.getElementById('root')).render(<SprintSetup topics={[]} params={{type:'mixed'}} />);`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"test"' },
      plugins: [
        {
          name: "synthetic-setup",
          setup(builder) {
            builder.onResolve(
              {
                filter:
                  /^(next\/link|@\/app\/\(app\)\/actions|@\/utils\/supabase\/client)$/,
              },
              ({ path }) => ({ path, namespace: "mock" }),
            );
            builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => {
              const contents =
                path === "next/link"
                  ? `import React from 'react'; export default function Link({href,prefetch,...props}){return <a href={typeof href==='string'?href:'#'} {...props}/>}`
                  : path.endsWith("actions")
                    ? "export async function startSprint(){return {error:'Synthetic start disabled'}}"
                    : `export const createClient=()=>({rpc:async()=>({data:{questions:100,marks:100,mcq_questions:50,short_marks:50,any:100,new:100,mistakes:0,flagged:0,topics:{},subtopics:{},all_subtopics:100,verbs:{},difficulty:{},all_years:100,years:[2020,2025]},error:null})});`;
              return { contents, loader: "tsx", resolveDir: process.cwd() };
            });
          },
        },
      ],
    });
    setup = result.outputFiles[0].text;
  });
  for (const width of [390, 1280])
    test(`Mixed five-mark minimum at ${width}px`, async ({ page }) => {
      test.setTimeout(25_000);
      page.on("pageerror", (error) => {
        throw error;
      });
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/__setup.js", (route) =>
        route.fulfill({ contentType: "text/javascript", body: setup }),
      );
      await page.route("**/__setup-test", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><div id="root"></div><script src="/__setup.js"></script>',
        }),
      );
      await page.goto("/__setup-test");
      // Template setup is a single page (no wizard Next). Mixed comes from params.
      await page.getByRole("button", { name: "Custom", exact: true }).click();
      const marks = page.getByRole("textbox", { name: "Marks" });
      await expect(marks).toBeVisible();
      await marks.fill("5");
      await marks.blur();
      await expect(marks).toHaveValue("5");
      await expect(marks).toHaveAccessibleDescription(/Minimum 5 marks/);
      await expect(
        page.getByRole("spinbutton", { name: "Multiple choice questions" }),
      ).toHaveValue("3");
      await marks.fill("1");
      await expect(page.getByText(/Enter 5–100 marks/)).toBeVisible();
      await marks.blur();
      await expect(marks).toHaveValue("1");
      await expect(
        page.getByRole("button", { name: /^Start (sprint|with)/ }),
      ).toBeDisabled();

      const check = page.getByRole("radio", { name: /^Check as I go/ });
      await check.focus();
      await page.keyboard.press("Space");
      await expect(check).toBeChecked();
      await expect(page.locator('input[name="config"]')).toHaveValue(
        /"feedback":"each"/,
      );
      await page.getByRole("radio", { name: /^Exam mode/ }).focus();
      await page.keyboard.press("Space");
      await expect(page.locator('input[name="config"]')).toHaveValue(
        /"feedback":"end"/,
      );
    });
});
