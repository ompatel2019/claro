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
// ?n=30 repeats the paper so progress can be checked at a long question count.
const n = Number(new URLSearchParams(location.search).get('n') || 0);
const rows = n ? Array.from({length:n}, (_, i) => ({...initial[i % 6], id:'a'+(i+1), question_id:'q'+(i+1), position:i+1, question:{...initial[i % 6].question, id:'q'+(i+1)}})) : initial;
createRoot(document.getElementById('root')).render(<SprintRunner session={{id:'s',kind:'sprint',config:{mode:'mixed',feedback:'end'},elapsed_s:312}} initial={rows} userId="u" title="Inflation sprint" />);`;

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

async function load(page: Page, width: number, height: number, query = "") {
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
  await page.goto(`${ORIGIN}/student/sprint/s${query}`);
  await page.evaluate(() => document.fonts.ready);
  if (!query) await expect(page.getByText(/Question 3 of 6/)).toBeVisible();
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

const sidebar = (page: Page) =>
  page.getByRole("complementary", { name: "Booklet" });

async function expectPaper(paper: ReturnType<Page["locator"]>) {
  await expect(paper.getByRole("listitem")).toHaveCount(6);
  await expect(
    paper.getByRole("button", { name: "Question 1: Answered, Flagged" }),
  ).toBeVisible();
  await expect(
    paper.getByRole("button", { name: "Question 3: Not answered" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(
    paper.getByText("B. An increase in household consumption"),
  ).toBeVisible();
  // Exam mode: the background mark on Q2 never shows.
  await expect(paper).not.toContainText(/\d+\/\d+|Full marks|No marks|Correct/);
  await expect(paper).toContainText("20 marks");
}

test("Booklet sidebar is open by default at 1440px, collapses, and jumps", async ({
  page,
}) => {
  await load(page, 1440, 900);
  await expect(page.getByRole("button", { name: "View booklet" })).toHaveCount(
    0,
  );
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  const rail = sidebar(page);
  await expect(rail).toBeVisible();
  await expect(rail).toContainText("2 of 6 answered");
  await expectPaper(rail);
  // Right-hand side of the question column.
  const box = await rail.boundingBox();
  expect(box!.x + box!.width).toBeGreaterThan(1400);
  await shots(page, 1440);

  await rail.getByRole("button", { name: "Collapse booklet" }).click();
  await expect(sidebar(page)).toHaveCount(0);
  await page.getByText("Inflation sprint").click();
  await page.keyboard.press("b");
  await expect(sidebar(page)).toBeVisible();

  await sidebar(page)
    .getByRole("button", { name: "Question 5: Not answered" })
    .click();
  await expect(page.getByText(/Question 5 of 6/)).toBeVisible();
  // A sidebar, not a modal: it stays open after a jump.
  await expect(sidebar(page)).toBeVisible();
});

test("Booklet at 390px is a closed drawer that opens and jumps", async ({
  page,
}) => {
  await load(page, 390, 844);
  await expect(sidebar(page)).toBeHidden();
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Booklet (B)" }).last().click();
  const drawer = page.locator('[data-slot="sheet-content"]');
  await expect(drawer).toBeVisible();
  await expectPaper(drawer);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await shots(page, 390);
  await drawer
    .getByRole("button", { name: "Question 6: Not answered" })
    .click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText(/Question 6 of 6/)).toBeVisible();
});

test("Flag for review sits above the question, ink-2 and outline", async ({
  page,
}) => {
  await load(page, 1440, 900);
  const flag = page.getByRole("button", { name: "Flag for review" });
  const details = page.getByRole("list", { name: "Question details" });
  await expect(details).toContainText("Question 3");
  await expect(details).toContainText("3 marks");
  const [flagBox, stemBox] = await Promise.all([
    flag.boundingBox(),
    page
      .getByText("Explain how a depreciation of the Australian dollar")
      .first()
      .boundingBox(),
  ]);
  expect(flagBox!.y).toBeLessThan(stemBox!.y);
  await expect(page.locator(".sprint-session-footer")).not.toContainText(
    "Flag",
  );
  const colour = (selector: string) =>
    page.evaluate(
      (sel) =>
        getComputedStyle(document.querySelector(sel)!).getPropertyValue(
          "--ink-2",
        ),
      selector,
    );
  const ink2 = (await colour("html")).trim();
  await flag.click();
  await expect(flag).toHaveAttribute("aria-pressed", "true");
  const icon = await flag
    .locator("svg")
    .evaluate((el) => [getComputedStyle(el).color, el.getAttribute("fill")]);
  expect(icon[1]).toBe("none");
  const ink2Rgb = await page.evaluate((c) => {
    const el = document.createElement("i");
    el.style.color = c;
    document.body.append(el);
    const rgb = getComputedStyle(el).color;
    el.remove();
    return rgb;
  }, ink2);
  expect(icon[0]).toBe(ink2Rgb);
});

test("30 progress segments fit 390px with no horizontal scroll", async ({
  page,
}) => {
  await load(page, 390, 844, "?n=30");
  await expect(page.getByText(/Question \d+ of 30/)).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Question progress" });
  await expect(nav.getByRole("button")).toHaveCount(30);
  const track = nav.locator("[data-progress-track]");
  const m = await track.evaluate((el) => ({
    sw: el.scrollWidth,
    cw: el.clientWidth,
    ox: getComputedStyle(el).overflowX,
  }));
  expect(m.ox).not.toMatch(/auto|scroll/);
  expect(m.sw).toBeLessThanOrEqual(m.cw);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

for (const dark of [false, true])
  test(`tracker segments in ${dark ? "dark" : "light"} mode`, async ({
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
    // The sidebar is open by default at 1440; at 390 the drawer opens from the toolbar.
    if (width < 768)
      await page.getByRole("button", { name: "Booklet (B)" }).last().click();
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

test("Calculator closes from its X, Esc and the toolbar toggle", async ({
  page,
}) => {
  await load(page, 1440, 900);
  const toggle = page.getByRole("button", { name: "Calculator (C)" });
  const calculator = page.getByRole("dialog", { name: "Calculator" });

  await toggle.click();
  await expect(calculator).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await calculator.getByRole("button", { name: "Close calculator" }).click();
  await expect(calculator).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(calculator).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calculator).toBeHidden();

  // Esc also works once focus has left the panel.
  await toggle.click();
  await expect(calculator).toBeVisible();
  await page.getByText("Inflation sprint").click();
  await page.keyboard.press("Escape");
  await expect(calculator).toBeHidden();

  await toggle.click();
  await expect(calculator).toBeVisible();
  await toggle.click();
  await expect(calculator).toBeHidden();
});

for (const [platform, key, label] of [
  ["MacIntel", "Meta", "⌘"],
  ["Win32", "Control", "Ctrl"],
] as const)
  test(`${label} Enter in the answer box moves to the next question (${platform})`, async ({
    page,
  }) => {
    await page.addInitScript((p) => {
      Object.defineProperty(Navigator.prototype, "platform", { get: () => p });
      Object.defineProperty(Navigator.prototype, "userAgentData", {
        get: () => undefined,
      });
    }, platform);
    await load(page, 1440, 900);
    const hint = page.locator("p").filter({ hasText: "↵ next question" });
    await expect(hint).toHaveText(`${label}↵ next question`);

    const answer = page.locator("textarea").first();
    await answer.fill("A lower dollar raises import prices.");
    // Ignored while a dialog owns the keyboard.
    await page.getByText("Inflation sprint").click();
    await page.keyboard.press("?");
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();
    await page.keyboard.press(`${key}+Enter`);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="dialog-content"]')).toBeHidden();
    await page.getByRole("button", { name: "Exit sprint" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.keyboard.press(`${key}+Enter`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(page.getByText(/Question 3 of 6/)).toBeVisible();
    await answer.press(`${key}+Enter`);
    await expect(page.getByText(/Question 4 of 6/)).toBeVisible();
    // The other modifier works too, whatever the platform.
    await page
      .locator("textarea")
      .first()
      .press(`${key === "Meta" ? "Control" : "Meta"}+Enter`);
    await expect(page.getByText(/Question 5 of 6/)).toBeVisible();
  });
