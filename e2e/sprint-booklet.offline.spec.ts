import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { offlineBundle, offlineCss } from "./offline-harness";

const ORIGIN = "http://localhost:3203";
let bundle: string;
let css: string;

// A six-question Exam mode sprint: Q1 answered + flagged, Q2 answered (marked in
// the background, which must stay hidden), Q3 current, Q4–Q6 not answered.
const fixture = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {SprintRunner} from './src/components/sprint-runner';
const q = (n, type, marks, stem, options = null) => ({id:'q'+n,type,marks,stem,options,topic_id:'t',source:'HSC',stimulus:null,year:2023});
const row = (n, question, patch = {}) => ({id:'a'+n,question_id:'q'+n,position:n,status:'pending',choice_index:null,answer_text:null,transcript:null,image_paths:null,flagged:false,mark:null,max_marks:null,band:null,feedback:null,question,...patch});
const initial = [
  row(1, q(1,'mcq',1,'Which of the following is most likely to cause demand-pull inflation?',['A rise in the cash rate','An increase in household consumption','A fall in the exchange rate','A rise in labour productivity']), {choice_index:1, flagged:true}),
  row(2, q(2,'mcq',1,'Which measure is used to set the RBA inflation target?',['CPI','GDP deflator','WPI','Trimmed mean CPI']), {choice_index:3, status:'marked', mark:1, max_marks:1}),
  row(3, q(3,'short',3,'Explain how a depreciation of the Australian dollar can affect the inflation rate.')),
  row(4, q(4,'short',4,'Outline TWO costs of high unemployment for the Australian economy.')),
  row(5, q(5,'mcq',1,'Structural unemployment is best described as unemployment caused by',['a downturn in the business cycle','a mismatch between skills and jobs','seasonal changes in demand','workers moving between jobs'])),
  row(6, q(6,'extended',20,'Analyse the effectiveness of monetary policy in achieving Australia’s internal balance objectives.')),
];
createRoot(document.getElementById('root')).render(<SprintRunner session={{id:'s',kind:'sprint',config:{mode:'mixed',feedback:'end'},elapsed_s:312}} initial={initial} userId="u" title="Inflation sprint" />);`;

const stubs = `
export const useRouter = () => ({ push() {}, replace() {}, refresh() {} });
export const usePathname = () => '/student/sprint/s';
const ok = { data: [{ id: 'a' }], error: null };
const chain = () => new Proxy({}, { get: (_t, key) => key === 'then' ? (resolve) => resolve(ok) : () => chain() });
export const createClient = () => chain();
export const ensureSession = async () => {};
export const withAuthRetry = (_db, fn) => fn();
export const cleanupAnswerPhotos = async () => {};`;

test.beforeAll(async () => {
  const font = await readFile("src/app/fonts/claro-sans/ClaroSans[wght].woff2");
  css =
    `@font-face { font-family: "Claro Sans"; src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2"); font-weight: 300 800; } :root { --font-claro-sans: "Claro Sans"; }` +
    (await offlineCss());
  bundle = await offlineBundle(fixture, [
    {
      name: "synthetic-sprint",
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^(next\/link|next\/navigation|@\/utils\/supabase\/client|@\/lib\/auth-client|@\/lib\/answer-photo-cleanup)$/,
          },
          ({ path }) => ({ path, namespace: "synthetic" }),
        );
        builder.onLoad(
          { filter: /.*/, namespace: "synthetic" },
          ({ path }) => ({
            contents:
              path === "next/link"
                ? "import React from 'react'; export default function Link({href,prefetch,...props}){return <a href={href} {...props}/>}"
                : stubs,
            loader: "tsx",
            resolveDir: process.cwd(),
          }),
        );
      },
    },
  ]);
});

async function load(page: Page, width: number, height: number) {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.setViewportSize({ width, height });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN)
      throw new Error("Offline booklet attempted a network call");
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({ contentType: "application/json", body: "{}" });
    return route.fulfill(
      url.pathname === "/fixture.js"
        ? { contentType: "text/javascript", body: bundle }
        : url.pathname.startsWith("/sounds/")
          ? { status: 204 }
          : {
              contentType: "text/html",
              body: `<!doctype html><html lang="en-AU"><head><style>${css}</style></head><body class="font-sans antialiased"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`,
            },
    );
  });
  await page.goto(`${ORIGIN}/student/sprint/s`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByText(/Question 3 of 6/)).toBeVisible();
}

async function shots(page: Page, width: number, name = "booklet") {
  const dir = process.env.BOOKLET_SHOTS;
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    );
    await page.screenshot({
      path: dir
        ? `${dir}/${name}-${width}-${theme}.png`
        : test.info().outputPath(`${name}-${width}-${theme}.png`),
      animations: "disabled",
    });
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

// The mobile sheet is also titled "Booklet"; the modal is the Dialog primitive.
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');

async function expectPaper(page: Page) {
  const modal = dialog(page);
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute("role", "dialog");
  await expect(modal).toHaveAccessibleName("Booklet");
  await expect(modal.getByText("2 of 6 answered")).toBeVisible();
  await expect(modal.getByRole("listitem")).toHaveCount(6);
  await expect(
    modal.getByRole("button", { name: "Question 1: Answered, Flagged" }),
  ).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Question 3: Not answered" }),
  ).toHaveAttribute("aria-current", "step");
  // Opens on the current question.
  await expect(
    modal.getByRole("button", { name: "Question 3: Not answered" }),
  ).toBeFocused();
  await expect(
    modal.getByText("B. An increase in household consumption"),
  ).toBeVisible();
  // Exam mode: the background mark on Q2 never shows.
  await expect(modal).not.toContainText(/\d+\/\d+|Full marks|No marks|Correct/);
  await expect(modal).toContainText("20 marks");
}

test("View booklet at 1440px: paper, keys blocked, Esc, focus trap, jump", async ({
  page,
}) => {
  await load(page, 1440, 900);
  await page.getByRole("button", { name: "Booklet (B)" }).first().click();
  const trigger = page.getByRole("button", { name: "View booklet" });
  await trigger.click();
  await expectPaper(page);
  await shots(page, 1440);

  // Focus stays inside the dialog while tabbing both ways.
  for (const key of [...Array(9).fill("Tab"), ...Array(9).fill("Shift+Tab")]) {
    await page.keyboard.press(key);
    // Base UI's focus guards hand focus straight back into the popup.
    await expect
      .poll(() =>
        page.evaluate(
          () => !!document.activeElement?.closest('[role="dialog"]'),
        ),
      )
      .toBe(true);
  }

  // Runner F / A–D and shell B / arrows do nothing behind the modal.
  for (const key of ["f", "a", "b", "ArrowRight", "k"])
    await page.keyboard.press(key);
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByText(/Question 3 of 6/)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(trigger).toBeFocused();
  // The rail is still open (B was ignored) and Q3 was not flagged.
  const rail = page.getByRole("navigation", { name: "Question booklet" });
  await expect(
    rail.getByRole("button", { name: "Question 3: Not answered" }),
  ).toBeVisible();

  await trigger.click();
  await dialog(page)
    .getByRole("button", { name: "Question 5: Not answered" })
    .click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByText(/Question 5 of 6/)).toBeVisible();
});

test("View booklet at 390px from the mobile sheet", async ({ page }) => {
  await load(page, 390, 844);
  await page.getByRole("button", { name: "Booklet (B)" }).last().click();
  await page.getByRole("button", { name: "View booklet" }).click();
  await expectPaper(page);
  // The sheet hands over to the modal rather than stacking under it.
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await shots(page, 390);

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await page.getByRole("button", { name: "Booklet (B)" }).last().click();
  await page.getByRole("button", { name: "View booklet" }).click();
  await dialog(page)
    .getByRole("button", { name: "Question 6: Not answered" })
    .click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
  await expect(page.getByText(/Question 6 of 6/)).toBeVisible();
});

for (const dark of [false, true])
  test(`tracker and MCQ selection in ${dark ? "dark" : "light"} mode`, async ({
    page,
  }) => {
    await load(page, 390, 844);
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    );
    const progress = page.getByRole("navigation", {
      name: "Question progress",
    });
    const fills = await progress
      .locator("button > span")
      .evaluateAll((pills) =>
        pills.map((pill) => getComputedStyle(pill).backgroundColor),
      );
    expect(fills[0]).not.toBe(fills[2]);
    expect(fills[2]).not.toBe(fills[3]);
    expect(fills[3]).toMatch(/0\.25/);
    await progress
      .getByRole("button", { name: "Question 5, not answered", exact: true })
      .click();
    const options = page.getByRole("radio");
    for (const [index, key] of ["a", "b", "c", "d"].entries()) {
      await page.keyboard.press(key);
      for (let i = 0; i < 4; i++) {
        const option = options.nth(i);
        await expect(option).toBeChecked({ checked: i === index });
        await expect(option.locator("..")).toHaveCSS(
          "background-color",
          i === index
            ? dark
              ? "rgb(59, 32, 25)"
              : "rgb(253, 238, 231)"
            : dark
              ? "rgb(29, 32, 57)"
              : "rgb(255, 255, 255)",
        );
        if (i === index)
          await expect(option.locator("..")).toHaveCSS(
            "border-color",
            "rgb(245, 79, 27)",
          );
      }
    }
  });

// Exam mode: Q2's background mark never reaches the rail, sheet or progress pills.
for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const)
  test(`Exam mode rail at ${width}px never shows awarded marks`, async ({
    page,
  }) => {
    await load(page, width, height);
    // Only the button for this breakpoint is visible: rail at 1440, sheet at 390.
    await page.getByRole("button", { name: "Booklet (B)" }).click();
    const rail = page.getByRole("navigation", { name: "Question booklet" });
    await expect(
      rail.getByRole("button", { name: "Question 2: Answered", exact: true }),
    ).toBeVisible();
    for (const nav of [
      rail,
      page.getByRole("navigation", { name: "Question progress" }),
    ])
      for (const label of await nav
        .getByRole("button")
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label"))))
        expect(label).not.toMatch(/\d+\/\d+|marks|correct/i);
    await expect(page.locator("body")).not.toContainText(
      /\d+\/\d+|Full marks|No marks|Correct/,
    );
    await shots(page, width, "exam-rail");
  });
