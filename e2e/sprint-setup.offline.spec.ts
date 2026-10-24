import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { offlineBundle, offlineCss } from "./offline-harness";

let bundle: string;
let css: string;
test.beforeAll(async () => {
  const font = await readFile("src/app/fonts/claro-sans/ClaroSans[wght].woff2");
  css =
    `@font-face { font-family: "Claro Sans"; src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2"); font-weight: 300 800; } :root { --font-claro-sans: "Claro Sans"; }` +
    (await offlineCss());
  bundle = await offlineBundle(
    `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {SprintSetup} from './src/components/sprint-setup';
    const parents = ['The Global Economy', 'Australia’s Place in the Global Economy', 'Economic Issues', 'Economic Policies and Management'].map((name,i)=>({id:'t'+(i+1),name,parent_id:null,sort:i}));
    const subs = [['International economic integration','Trade and financial flows','Protection'],['Balance of payments','Exchange rates'],['Economic growth','Unemployment','Inflation'],['Fiscal policy','Monetary policy']].flatMap((names,i)=>names.map((name,j)=>({id:'t'+(i+1)+'-'+j,name,parent_id:'t'+(i+1),sort:j})));
    createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-6xl px-4 py-6"><h1 className="mb-6 text-3xl font-bold">Topic Sprint</h1><SprintSetup topics={[...parents,...subs]} params={{}} /></main>);`,
    [
      {
        name: "synthetic-setup",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(next\/link|@\/app\/\(app\)\/actions|@\/utils\/supabase\/client)$/,
            },
            ({ path }) => ({ path, namespace: "synthetic" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "synthetic" },
            ({ path }) => ({
              contents:
                path === "next/link"
                  ? `import React from 'react'; export default function Link({href,prefetch,...props}){return <a href={href} {...props}/>}`
                  : path.endsWith("actions")
                    ? "export async function startSprint(){return {error:'Synthetic start disabled'}}"
                    : `export const createClient=()=>({rpc:async()=>({data:{questions:100,marks:200,mcq_questions:50,short_marks:150,short_questions:50,short_mark_values:{2:10,3:10,4:10,5:10,6:10},any:100,new:80,mistakes:0,flagged:0,topics:{},subtopics:Object.fromEntries(Array.from({length:4},(_,i)=>Array.from({length:3},(_,j)=>['t'+(i+1)+'-'+j,10])).flat()),all_subtopics:100},error:null})});`,
              loader: "tsx",
              resolveDir: process.cwd(),
            }),
          );
        },
      },
    ],
  );
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`progressive topics, sizing and feedback at ${width}px`, async ({
    page,
  }) => {
    page.on("pageerror", (error) => {
      throw error;
    });
    await page.setViewportSize({ width, height });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://localhost:3202")
        throw new Error("Offline setup attempted a network call");
      return route.fulfill(
        url.pathname === "/fixture.js"
          ? { contentType: "text/javascript", body: bundle }
          : {
              contentType: "text/html",
              body: `<!doctype html><html lang="en-AU"><head><style>${css}</style></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`,
            },
      );
    });
    const capture = async (name: string) => {
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await page.screenshot({
        path: process.env.SPRINT_SETUP_SHOTS
          ? `${process.env.SPRINT_SETUP_SHOTS}/${name}-${width}.png`
          : test.info().outputPath(`${name}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
    };
    await page.goto("http://localhost:3202/student/sprint");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByText("100 questions match")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "All topics" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: /subtopics$/ })).toHaveCount(
      0,
    );
    await expect(page.getByText("Paper years", { exact: true })).toHaveCount(0);
    await capture("setup-initial");
    const timer = page.getByRole("region", { name: "Timer" });
    const timed = timer.getByRole("switch", { name: /Timed at exam pace/ });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
      }, theme);
      await expect(timed).toBeChecked();
      await expect(timer.getByLabel("Shorts: minutes per mark")).toBeVisible();
      await expect(
        timer.getByLabel("Multis: minutes per question"),
      ).toBeVisible();
      await expect(timer.getByText(/≈ \d+ min/)).toBeVisible();
      await expect(timer.getByText(/Keep working in overtime/)).toBeVisible();
      await expect(page.getByText("Adjust exam pace")).toHaveCount(0);
      await expect(timer.locator("details, summary")).toHaveCount(0);
      expect(
        await timed.locator("..").evaluate((el) => {
          const style = getComputedStyle(el);
          return [style.borderTopWidth, style.backgroundColor];
        }),
      ).toEqual(["0px", "rgba(0, 0, 0, 0)"]);
      await timer.screenshot({
        path: test.info().outputPath(`timer-${theme}-${width}.png`),
        animations: "disabled",
      });
      await timed.click();
      await expect(timed).not.toBeChecked();
      await expect(timer.getByRole("spinbutton")).toHaveCount(0);
      await expect(timer.getByText(/≈/)).toHaveCount(0);
      await expect(timer.getByText(/Keep working in overtime/)).toHaveCount(0);
      await timed.click();
    }
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    const bar = page
      .getByRole("button", { name: "Start sprint" })
      .locator("xpath=ancestor::div[contains(@class,'fixed')][1]");
    expect(
      await bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          radius: parseFloat(style.borderTopLeftRadius),
          shadow: style.boxShadow,
        };
      }),
    ).toEqual({
      left: 0,
      right: width,
      bottom: height,
      radius: 0,
      shadow: "none",
    });
    await page.screenshot({
      path: process.env.SPRINT_SETUP_SHOTS
        ? `${process.env.SPRINT_SETUP_SHOTS}/bar-${width}.png`
        : test.info().outputPath(`bar-${width}.png`),
    });
    await page
      .getByRole("button", { name: "Economic Issues", exact: true })
      .click();
    const subtopics = page.getByRole("group", {
      name: "Economic Issues subtopics",
    });
    await expect(subtopics).toBeVisible();
    await expect(page.getByRole("group", { name: /subtopics$/ })).toHaveCount(
      1,
    );
    await subtopics.getByRole("button", { name: "Inflation 10" }).click();
    await capture("setup-topic");
    await page
      .getByRole("button", { name: "Short answer", exact: true })
      .click();
    await page.getByRole("button", { name: "5 marks", exact: true }).click();
    await capture("setup-short-marks");
    await page.getByRole("button", { name: "Mixed", exact: true }).click();
    const mc = page.getByRole("spinbutton", {
      name: "Multiple choice questions",
    });
    const shorts = page.getByRole("spinbutton", {
      name: "Short answer questions",
    });
    await mc.fill("12");
    await mc.press("Enter");
    await shorts.fill("7");
    await shorts.press("Enter");
    await expect(mc).toHaveValue("12");
    await expect(shorts).toHaveValue("7");
    await expect(page.getByText("Total: 47 marks.")).toBeVisible();
    await capture("setup-mixed");
    const check = page.getByRole("radio", {
      name: "Check as I go",
      exact: true,
    });
    await check.focus();
    await page.keyboard.press("Space");
    await expect(check).toBeChecked();
    await expect(page.locator('input[name="config"]')).toHaveValue(
      /"feedback":"each"/,
    );
    await capture("setup-check-as-i-go");
    const exam = page.getByRole("radio", { name: "Exam mode", exact: true });
    await exam.focus();
    await page.keyboard.press("Space");
    await expect(exam).toBeChecked();
    await expect(page.locator('input[name="config"]')).toHaveValue(
      /"feedback":"end"/,
    );
    await capture("setup-exam-mode");
    await page.getByRole("button", { name: "All topics" }).click();
    await expect(page.getByRole("group", { name: /subtopics$/ })).toHaveCount(
      0,
    );
  });
}
