import { expect, test, type Page, type Locator } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";

let bundle: string;
let css: string;
test.beforeAll(async () => {
  css = (
    await postcss([tailwind()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import Home from './src/app/(app)/student/page';
        import Admin from './src/app/admin/page';
        import Flashcards from './src/app/admin/content/flashcards/page';
        import {ActivityBrowser} from './src/components/activity-browser';
        import {resolve} from './src/test/resolve-server-components';
        import {FeedbackWidget} from './src/components/feedback-widget';
        const f=Object.fromEntries(new URLSearchParams(location.search));
        const activity={rows:[{id:'s',kind:'sprint',title:'Mixed sprint · Inflation',status:'Finished',provisional:false,study:false,pct:75,items:8,answered:8,elapsed_s:125,started_at:'2026-10-19T00:00:00Z',finished_at:'2026-10-19T00:02:00Z'}],page:1,total:1,all_total:1,kinds:{sprint:1},kind_total:1,stats:{sessions:1,questions:8,average:75,best:75}};
        const path=location.pathname;
        const page=path.includes('flashcards') ? await Flashcards({searchParams:Promise.resolve(f)}) : path.includes('admin') ? Admin() : path.includes('activity') ? <ActivityBrowser data={activity} filters={{kind:'',status:'',topic:'',range:'',q:'',sort:'newest',date:'',from:'',to:'',page:1}} topics={[]} today="2026-10-19"/> : await Home();
        const resolved=await resolve(page);
        createRoot(document.getElementById('root')).render(<FeedbackWidget userId="student"><header className="h-16 border-b px-4 py-5">Claro</header><main className="mx-auto max-w-[1280px] px-4 py-6 md:px-6"><div className="pb-0 lg:pb-12">{resolved}</div></main></FeedbackWidget>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [
      {
        name: "synthetic-pages",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|next\/(link|navigation|form)|@\/lib\/(auth|admin-data|admin-flashcards|admin-content)|@\/utils\/supabase\/(server|client)|@\/components\/(welcome-dialog|shortcut|flashcard-import|flashcards-table|flashcard-start))$/,
            },
            ({ path }) => ({ path, namespace: "synthetic" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "synthetic" },
            ({ path }) => {
              const topics = [
                { id: "t1", name: "Global", parent_id: null, sort: 1 },
                { id: "t3", name: "Issues", parent_id: null, sort: 2 },
                {
                  id: "inflation",
                  name: "Inflation",
                  parent_id: "t3",
                  sort: 3,
                },
                { id: "trade", name: "Trade", parent_id: "t1", sort: 4 },
              ];
              const contents =
                path === "next/link"
                  ? `import React from 'react'; export default function Link({href,prefetch,...props}){return <a href={href} {...props}/>}`
                  : path === "next/form"
                    ? `import React from 'react'; export default function Form(props){return <form method="get" {...props}/>} `
                    : path === "next/navigation"
                      ? `export const useRouter=()=>({push:(url)=>location.assign(url),refresh:()=>location.reload()}); export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search);`
                      : path === "@/lib/auth"
                        ? `export const requireProfile=async()=>({id:'student',full_name:'Synthetic Student',role:'student',year_level:12});export const requireAdmin=async()=>({role:'admin'});`
                        : path === "@/lib/admin-content"
                          ? `export const loadTopics=async()=>(${JSON.stringify(topics)});`
                          : path === "@/lib/admin-flashcards"
                            ? `export const loadFlashcardCounts=async()=>({own:0,live:0,draft:0,retired:0});export const loadFlashcardList=async()=>({rows:[],status:'live'});`
                            : path === "@/components/flashcards-table"
                              ? `export const AddCard=()=>null;export const FlashcardsTable=()=>null;`
                              : path === "@/components/flashcard-import"
                                ? `export const FlashcardImport=()=>null;`
                                : path === "@/components/flashcard-start"
                                  ? `import React from 'react'; export const FlashcardStart=({label})=><button>{label}</button>;`
                                  : path === "@/components/shortcut"
                                    ? `export const Shortcut=()=>null;`
                                    : path === "@/components/welcome-dialog"
                                      ? `export const WelcomeDialog=()=>null;`
                                      : path === "@/lib/admin-data"
                                        ? `export const loadDashboard=async()=>({students:1,active:{now:2,prev:1},sessionsWeek:3,openReviews:{count:1,oldestDays:2},spend:{all:81,month:10,cap:100},sessionsTotal:3,spendTotal:2,sessionsPerDay:[],spendPerDay:[],attention:{failed:0,newFeedback:2,contentReports:1,importReview:0,agreement:90},latest:Array.from({length:10},(_,i)=>({id:'s'+i,user_id:'u',name:'Student '+i,kind:'single',mode:null,score:2,max:2,finished_at:'2026-10-19T00:00:00Z'}))});`
                                        : path === "@/utils/supabase/client"
                                          ? `export const createClient=()=>({});`
                                          : path === "@/utils/supabase/server"
                                            ? `const topicsData=${JSON.stringify(topics)};const progress={topics:topicsData.map((t,i)=>({...t,answered:i+1,earned:i,possible:i+2,pct:50+i*10,last_answered:'2026-10-18T00:00:00Z'})),types:[],verbs:[],history:[],mastery:[],missed:[],due:[]};const days=[{day:'2026-10-19',questions:4,cards:2},{day:'2026-10-16',questions:20,cards:0},{day:'2026-10-15',questions:0,cards:40},{day:'2026-09-01',questions:8,cards:8}];const query={select(){return this},eq(){return this},in(){return this},is(){return this},order(){return this},lte(){return this},limit:async()=>({data:[{id:'resume',kind:'single',config:{},elapsed_s:0,started_at:'2026-10-19T00:00:00Z',attempts:[],flashcard_reviews:[]}],error:null}),then(done){return Promise.resolve(done({data:topicsData,count:7,error:null}))}};export const createClient=async()=>({from:()=>query,rpc:(name)=>name==='student_progress'?Promise.resolve({data:progress,error:null}):Object.assign(Promise.resolve({data:days,error:null}),{single:async()=>({data:{current_streak:3,longest_streak:8},error:null})})});`
                                            : "";
              return { contents, loader: "tsx", resolveDir: process.cwd() };
            },
          );
        },
      },
    ],
  });
  bundle = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://claro.test")
      throw new Error("Offline test attempted a network call");
    if (url.pathname === "/__fixture.js")
      return route.fulfill({ contentType: "text/javascript", body: bundle });
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en-AU" style="--font-claro-sans:Arial"><head><style>${css}</style></head><body><div id="root"></div><script type="module" src="/__fixture.js"></script></body></html>`,
    });
  });
});
async function capture(
  page: Page,
  target: Locator,
  number: string,
  label: string,
  file: string,
) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Screenshot target is missing");
  await page.evaluate(
    ({ box, number, label }) => {
      const overlay = document.createElement("div");
      overlay.dataset.annotation = "lane-c";
      overlay.style.cssText = `position:absolute;z-index:9999;pointer-events:none;left:${box.x}px;top:${box.y + scrollY}px;width:${box.width}px;height:${box.height}px;border:3px solid #f97316;border-radius:12px`;
      const caption = document.createElement("span");
      caption.textContent = `${number} · ${label}`;
      caption.style.cssText =
        "position:absolute;left:4px;top:-26px;background:#f97316;color:white;padding:3px 8px;border-radius:8px;font:600 13px sans-serif";
      overlay.append(caption);
      document.body.append(overlay);
    },
    { box, number, label },
  );
  await page.screenshot({ path: test.info().outputPath(file), fullPage: true });
  await page
    .locator('[data-annotation="lane-c"]')
    .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
}

test("S1: desktop feedback is fixed and adds no document height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("http://claro.test/student");
  const feedback = page.getByRole("button", { name: "Feedback" });
  await expect(feedback).toBeVisible();
  expect(await feedback.evaluate((el) => getComputedStyle(el).position)).toBe(
    "fixed",
  );
});
for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [390, 844],
]) {
  test(`Home v2: hero, tiles, study days and study hub at ${width}px`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-10-19T01:00:00Z"));
    await page.setViewportSize({ width, height });
    await page.goto("http://claro.test/student");
    // STEP2 template hero: TermProgress pill (md+), not the old Week heading card.
    if (width >= 768) {
      const hero = page.getByRole("region", { name: "Your study week" });
      await expect(hero.getByText("Term 4 · Week 2")).toBeVisible();
    }
    const quick = page.getByRole("region", { name: "Quick start" });
    await expect(quick.getByRole("link")).toHaveCount(4);
    for (const [name, href] of [
      ["Marks earned", "/student/progress"],
      ["Questions answered", "/student/sprint"],
      ["Study time", "/student/activity"],
      ["Cards due", "/student/flashcards"],
    ])
      await expect(quick.getByRole("link", { name: name })).toHaveAttribute(
        "href",
        href,
      );
    await expect(page.getByTestId("activity-heatmap")).toBeVisible();
    await expect(page.locator('[aria-current="date"]')).toHaveAttribute(
      "data-day",
      "2026-10-19",
    );
    await expect(page.getByText("Day streak")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Light up today" }),
    ).toBeVisible();
    const hub = page.getByRole("region", { name: "Study hub" });
    await expect(hub.getByRole("listitem")).toHaveCount(2);
    await expect(
      hub.getByRole("listitem").first().getByRole("link"),
    ).toHaveAttribute("href", "/student/sprint?topics=t1");
    await expect(page.getByText("Continue where you left off")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: test.info().outputPath(`home-v2-${width}.png`),
      fullPage: true,
    });
  });
}
test("S11: activity row shows result, date, and opens the session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://claro.test/student/activity");
  const table = page.getByRole("table", { name: "Your activity" });
  // Template table: Session, Topic, Result, Time, When, Open (some hidden by breakpoint).
  await expect(table.getByRole("columnheader")).toHaveCount(6);
  const row = table.locator("tbody tr").filter({ has: page.locator("td") });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("75%");
  await expect(row).not.toContainText("Finished");
  await expect(row.getByText(/Mon,? 19 Oct/)).toBeVisible();
  await capture(
    page,
    table,
    "11",
    "Activity result + date",
    "s11-activity.png",
  );
  await row.click();
  await expect(page).toHaveURL("http://claro.test/student/sprint/s/results");
});
test("A1: attention precedes charts, mini-list has three working report links", async ({
  page,
}) => {
  await page.goto("http://claro.test/admin");
  const attention = page.getByRole("heading", { name: "Needs attention" });
  const chart = page.getByRole("heading", {
    name: "Sessions per day",
    exact: true,
  });
  await expect(attention).toBeVisible();
  expect((await attention.boundingBox())!.y).toBeLessThan(
    (await chart.boundingBox())!.y,
  );
  const list = page.getByRole("list", { name: "Recent sessions" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByRole("link").first()).toHaveAttribute(
    "href",
    "/admin/students/u?tab=sessions&session=s0",
  );
  await capture(
    page,
    attention.locator('xpath=ancestor::*[@data-slot="card"]'),
    "A1",
    "Needs attention first",
    "a1-dashboard.png",
  );
  await page.getByRole("link", { name: /open mark reviews/ }).click();
  await expect(page).toHaveURL(
    "http://claro.test/admin/marking/review?tab=open",
  );
});
test("A2: Topic selection changes Subtopic choices and clears an old child", async ({
  page,
}) => {
  await page.goto(
    "http://claro.test/admin/content/flashcards?topic=t3&sub=inflation",
  );
  await expect(
    page.getByRole("combobox", { name: "Subtopic", exact: true }),
  ).toContainText("Inflation");
  await page.getByRole("combobox", { name: "Topic", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Inflation", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "Global", exact: true }).click();
  await expect(page).toHaveURL(
    "http://claro.test/admin/content/flashcards?status=live&q=&kind=&topic=t1&origin=",
  );
  await page.getByRole("combobox", { name: "Subtopic", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Trade", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Inflation", exact: true }),
  ).toHaveCount(0);
  await capture(
    page,
    page.locator("form"),
    "A2",
    "Topic then Subtopic",
    "a2-subtopics.png",
  );
});
