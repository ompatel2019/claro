import { offlineCss, offlineBundle } from "./offline-harness";
import { expect, test, type Page, type Locator } from "@playwright/test";

let bundle: string;
let css: string;
test.beforeAll(async () => {
  css = await offlineCss();
  bundle = await offlineBundle(
    `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {ResultsAnswers} from './src/components/results-report';
        import {ImportCards} from './src/components/student/flashcards/import-cards';
        import Home from './src/app/(app)/student/page';
        import Admin from './src/app/admin/page';
        import Flashcards from './src/app/admin/content/flashcards/page';
        import {ActivityBrowser} from './src/components/activity-browser';
        import Progress from './src/app/(app)/student/progress/page';
        import {resolve} from './src/test/resolve-server-components';
        import {FeedbackWidget,useFeedback} from './src/components/feedback-widget';
        function FeedbackTrigger(){const open=useFeedback();return <button onClick={()=>open()}>Feedback</button>;}
        const f=Object.fromEntries(new URLSearchParams(location.search));
        const activity={rows:[{id:'s',kind:'sprint',title:'Mixed sprint · Inflation',status:'Finished',provisional:false,study:false,pct:75,items:8,answered:8,elapsed_s:125,started_at:'2026-10-19T00:00:00Z',finished_at:'2026-10-19T00:02:00Z'}],page:1,total:1,all_total:1,kinds:{sprint:1},kind_total:1,stats:{sessions:1,questions:8,average:75,best:75}};
        // Synthetic sprint review using the same composition as SprintResults.
        const answer = 'Real GDP removes the effect of price changes.\\n' + Array.from({length:12}, (_,i)=>'Working line '+(i+1)+': compare nominal output with the price index.').join('\\n') + '\\nReal GDP = nominal GDP divided by the price index.';
        const quotes = ['Real GDP removes', 'Working line 6', 'Real GDP = nominal GDP'];
        const row = {attempt_id:'synthetic-answer',question_id:'synthetic-question',position:2,type:'short',status:'marked',check_status:'none',source:'Practice',year:null,topic_id:null,stem:'Calculate real GDP.',marks:3,max_marks:3,mark:1,answer_text:answer,transcript:null,image_paths:[],criteria:[],feedback:{earned:[],missing_points:['Calculate the value'],comments:quotes.map((quote,i)=>({kind:i===0?'strength':'fix',quote,start:answer.indexOf(quote),tag:'Knowledge',body:'Use the supplied nominal GDP and price index to calculate real output. Show each step and state the units.',next_mark:i===0?null:'Substitute the figures and give the calculated value with units.'}))}};
        const path=location.pathname;
        const page=path.endsWith('/results-review') ? <><h1>Synthetic sprint results</h1><ResultsAnswers rows={[row]} id="synthetic-sprint" name={()=>''} photos={new Map()} sprintLayout readOnly/><div className="h-screen"/></> : path.endsWith('/flashcards/import') ? <ImportCards topics={[{id:'inflation',name:'Inflation',parent_id:'t3',sort:1}]}/> : path.includes('progress') ? await Progress({searchParams:Promise.resolve(f)}) : path.includes('flashcards') ? await Flashcards({searchParams:Promise.resolve(f)}) : path.includes('admin') ? Admin() : path.includes('activity') ? <ActivityBrowser data={activity} filters={{kind:'',status:'',topic:'',range:'',q:'',sort:'newest',date:'',from:'',to:'',page:1}} topics={[]} today="2026-10-19"/> : await Home();
        const resolved=await resolve(page);
        createRoot(document.getElementById('root')).render(<FeedbackWidget userId="student"><header className="h-16 border-b px-4 py-5">Claro<FeedbackTrigger/></header><main className="mx-auto max-w-[1280px] px-4 py-6 md:px-6"><div className="pb-0 lg:pb-12">{resolved}</div></main></FeedbackWidget>);`,
    [
      {
        name: "synthetic-pages",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|@\/app\/\(app\)\/flashcards\/my-card-actions|next\/(link|navigation|form)|@\/lib\/(auth|admin-data|admin-flashcards|admin-content)|@\/utils\/supabase\/(server|client)|@\/components\/(welcome-dialog|shortcut|flashcard-import|flashcards-table|flashcard-start))$/,
            },
            ({ path }) => ({ path, namespace: "synthetic" }),
          );
          builder.onLoad(
            { filter: /.*/, namespace: "synthetic" },
            ({ path }) => {
              const topics = [
                {
                  id: "t1",
                  name: "The Global Economy",
                  parent_id: null,
                  sort: 1,
                },
                { id: "t3", name: "Economic Issues", parent_id: null, sort: 2 },
                {
                  id: "inflation",
                  name: "Inflation",
                  parent_id: "t3",
                  sort: 3,
                },
                { id: "trade", name: "Trade", parent_id: "t1", sort: 4 },
                {
                  id: "t2",
                  name: "Australia’s Place in the Global Economy",
                  parent_id: null,
                  sort: 2,
                },
                {
                  id: "t4",
                  name: "Economic Policies and Management",
                  parent_id: null,
                  sort: 4,
                },
              ];
              if (path === "@/app/(app)/flashcards/my-card-actions")
                return {
                  contents: `export const loadMyCardFronts=async()=>({fronts:[]});export const importMyCards=async(cards)=>{window.importedCards=cards;return {ids:cards.map((_,i)=>String(i))}};export const deleteMyCards=async(ids)=>({ids});export const saveMyCard=async()=>({ids:[]});`,
                  loader: "tsx",
                };
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
                                        ? `export const loadDashboard=async()=>({students:1,active:{now:2,prev:1},openReviews:{count:1,oldestDays:2},spend:{all:81,month:10,cap:100},sessionsPerDay:[],spendPerDay:[],attention:{failed:0,newFeedback:2,contentReports:1,importReview:0,agreement:90},latest:Array.from({length:10},(_,i)=>({id:'s'+i,user_id:'u',name:'Student '+i,kind:'single',mode:null,score:2,max:2,finished_at:'2026-10-19T00:00:00Z'}))});`
                                        : path === "@/utils/supabase/client"
                                          ? `export const createClient=()=>({});`
                                          : path === "@/utils/supabase/server"
                                            ? `const topicsData=${JSON.stringify(topics)};const progress={topics:topicsData.map((t,i)=>({...t,answered:i+1,earned:i,possible:i+2,pct:50+i*10,last_answered:'2026-10-18T00:00:00Z'})),types:[],verbs:[],history:[],mastery:[],missed:[],due:[]};const days=[{day:'2026-10-19',questions:4,cards:2},{day:'2026-10-16',questions:20,cards:0},{day:'2026-10-15',questions:0,cards:40},{day:'2026-09-01',questions:8,cards:8}];const query={select(){return this},eq(){return this},in(){return this},is(){return this},not(){return this},order(){return this},lte(){return this},limit:async()=>({data:[{id:'resume',kind:'single',config:{},elapsed_s:0,started_at:'2026-10-19T00:00:00Z',attempts:[],flashcard_reviews:[]}],error:null}),then(done){return Promise.resolve(done({data:topicsData,count:7,error:null}))}};export const createClient=async()=>({from:()=>query,rpc:(name)=>name==='student_progress'?Promise.resolve({data:progress,error:null}):Object.assign(Promise.resolve({data:days,error:null}),{single:async()=>({data:{current_streak:3,longest_streak:8},error:null})})});`
                                            : "";
              return { contents, loader: "tsx", resolveDir: process.cwd() };
            },
          );
        },
      },
    ],
  );
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

test("S1: feedback trigger opens the shared dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("http://claro.test/student");
  const feedback = page.getByRole("button", { name: "Feedback" });
  await expect(feedback).toBeVisible();
  await feedback.click();
  await expect(
    page.getByRole("dialog", { name: "Send feedback" }),
  ).toBeVisible();
});
for (const [width, height] of [
  [1440, 900],
  [1280, 720],
  [768, 900],
  [1024, 900],
  [390, 844],
]) {
  test(`Home: next step, recent feedback and this week at ${width}px`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-10-19T01:00:00Z"));
    await page.setViewportSize({ width, height });
    await page.goto("http://claro.test/student");
    await expect(page.getByText(/Term 4, week 2/)).toBeVisible();
    const next = page.locator(".home-next");
    await expect(
      next.getByRole("link", { name: /Start sprint/ }),
    ).toHaveAttribute("href", /^\/student\/sprint/);
    await expect(
      next.getByRole("link", { name: "Flashcards" }),
    ).toHaveAttribute("href", "/student/flashcards");
    await expect(
      page.getByRole("heading", { name: "Recent feedback" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This week" }),
    ).toBeVisible();
    await expect(page.getByLabel("Mon: practised")).toHaveAttribute(
      "aria-current",
      "date",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    const recent = await page.locator(".home-card").first().boundingBox();
    const week = await page.locator(".home-week").boundingBox();
    if (width === 768 || width === 1024) {
      expect(week!.y).toBeGreaterThanOrEqual(recent!.y + recent!.height);
    }
    const weekdays = page.getByRole("list", {
      name: "Practice days this week",
    });
    expect(
      await weekdays.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    if (width === 1440)
      expect(
        await page.evaluate(
          () => document.scrollingElement!.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`home-v3-${width}.png`),
      fullPage: true,
    });
  });
}
test("S11: activity row shows result, date, and opens the session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://claro.test/student/activity");
  const list = page.getByRole("region", { name: "Your activity" });
  await expect(
    list.getByRole("heading", { name: /^Today · Mon 19 Oct/ }),
  ).toBeVisible();
  const row = list.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("75%");
  await expect(row).not.toContainText("Finished");
  await expect(row.getByText("11:00am")).toBeVisible();
  await capture(page, list, "11", "Activity result + date", "s11-activity.png");
  await row.click();
  await expect(page).toHaveURL("http://claro.test/student/activity/s");
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
  await page
    .getByRole("option", { name: "The Global Economy", exact: true })
    .click();
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
    page.locator('form[data-slot="filter-bar-desktop"]'),
    "A2",
    "Topic then Subtopic",
    "a2-subtopics.png",
  );
});

test("Progress: mobile topic rows and sprint actions stay within the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://claro.test/student/progress");
  await expect(
    page.getByRole("heading", { name: "Marks by topic", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(
    "Marks by topic",
  );
  await expect(
    page.getByRole("heading", { name: "Practice average", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Show chart data" }),
  ).toHaveCount(0);
  const topics = page.getByRole("table", {
    name: "Marks by topic",
    exact: true,
  });
  await expect(topics.getByText("Focus", { exact: true })).toBeVisible();
  await topics
    .getByRole("button", { name: "The Global Economy", exact: true })
    .click();
  await expect(
    topics.getByRole("link", { name: "Sprint on Trade", exact: true }),
  ).toHaveAttribute("href", "/student/sprint?topics=t1&sub=trade");
  const days = page
    .getByRole("group", {
      name: "Practice days over the last eight weeks",
    })
    .getByRole("link");
  expect(await days.count()).toBeGreaterThan(0);
  for (const day of await days.all()) {
    const box = await day.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);
  }
  await days.last().focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(days.last()).toBeFocused();
  await expect(days.last()).toHaveCSS("outline-width", "2px");
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => ({
        tag: el.tagName,
        cls: el.className,
        right: el.getBoundingClientRect().right,
      })),
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    JSON.stringify(overflow),
  ).toBe(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const loss = await page
    .getByRole("heading", { name: "Where your marks go" })
    .locator('xpath=ancestor::*[@data-slot="card"][1]')
    .boundingBox();
  const types = await page
    .getByRole("heading", { name: "By question type" })
    .locator('xpath=ancestor::*[@data-slot="card"][1]')
    .boundingBox();
  expect(loss!.y).toBe(types!.y);
  expect(loss!.height).toBe(types!.height);
});

test("Feedback chips have individual borders and no outer tray in both themes", async ({
  page,
}) => {
  await page.goto("http://claro.test/student/progress");
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  const group = page.getByRole("group", { name: "Feedback type" });
  const general = group.getByRole("button", { name: "General", exact: true });
  const bug = group.getByRole("button", { name: "Bug", exact: true });
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    );
    await expect(group).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(group).toHaveCSS("border-width", "0px");
    await expect(group).toHaveCSS("padding", "0px");
    await general.click();
    await expect(general).toHaveAttribute("aria-pressed", "true");
    await expect(bug).toHaveAttribute("aria-pressed", "false");
    await expect(general).toHaveCSS("border-width", "1px");
    await expect(bug).toHaveCSS("border-width", "1px");
    await expect(async () => {
      const selected = await general.evaluate(
        (el) => getComputedStyle(el).borderColor,
      );
      const unselected = await bug.evaluate(
        (el) => getComputedStyle(el).borderColor,
      );
      expect(selected).not.toBe(unselected);
    }).toPass();
    await bug.click();
    await expect(bug).toHaveAttribute("aria-pressed", "true");
    await expect(general).toHaveAttribute("aria-pressed", "false");
  }
});

test("Flashcard import: Quizlet guide, preview and cleaned submission", async ({
  page,
}) => {
  await page.goto("http://claro.test/student/flashcards/import");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("radio", { name: "Quizlet", exact: true }).click();
  await expect(
    page.getByText("Select Copy text, then paste it below."),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("flashcard-import-guide.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Paste text")
    .fill(
      "Inflation\tRising prices\nGDP\tOutput\nBad line\nTariff\tImport tax",
    );
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("3 cards ready · 1 line skipped")).toBeVisible();
  await expect(
    page.getByText("Line 3: No tab between front and back"),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("Rising prices"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import 3 cards" }),
  ).toBeDisabled();
  await page.getByRole("combobox", { name: "Subtopic" }).click();
  await page.getByRole("option", { name: "Inflation", exact: true }).click();
  await page.screenshot({
    path: test.info().outputPath("flashcard-import-preview.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Import 3 cards" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as Window & { importedCards?: unknown[] }).importedCards,
    ),
  ).toEqual([
    {
      front: "Inflation",
      back: "Rising prices",
      topic_id: "inflation",
      kind: "term",
    },
    { front: "GDP", back: "Output", topic_id: "inflation", kind: "term" },
    {
      front: "Tariff",
      back: "Import tax",
      topic_id: "inflation",
      kind: "term",
    },
  ]);
});

test("Results review: outside click and Escape clear comment focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://claro.test/student/results-review");
  const review = page.locator("#q-2");
  const marks = review.locator('mark[role="button"]');
  const pressed = review.locator('[data-card][aria-pressed="true"]');
  const dimmed = review.locator("[data-card][data-dim]");
  await marks.first().click();
  await expect(pressed).toHaveCount(1);
  await expect(dimmed).toHaveCount(2);
  await page.getByRole("heading", { name: "Synthetic sprint results" }).click();
  await expect(pressed).toHaveCount(0);
  await expect(dimmed).toHaveCount(0);
  await marks.first().click();
  await expect(pressed).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(pressed).toHaveCount(0);
  await expect(dimmed).toHaveCount(0);
  await marks.first().click();
  await marks.nth(1).click();
  await expect(pressed).toContainText("Working line 6");
  await pressed.click();
  await expect(pressed).toHaveCount(0);
  await expect(dimmed).toHaveCount(0);
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`Results review: reveal the entire translated comment (${reducedMotion})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion });
    await page.goto("http://claro.test/student/results-review");
    const highlight = page.locator('#q-2 mark[role="button"]').last();
    const card = page.locator('#q-2 [data-card][aria-pressed="true"]');
    await expect(highlight).toBeVisible();
    const positionHighlight = async (top: number) => {
      await highlight.evaluate((el, top) => {
        window.scrollBy(0, el.getBoundingClientRect().top - top);
      }, top);
    };
    // When alignment leaves enough room for the whole card, the page must stay put.
    await positionHighlight(220);
    const before = await page.evaluate(() => scrollY);
    await highlight.click();
    await page.waitForTimeout(50);
    await highlight.click(); // Repeated selection during translation keeps the alignment.
    await expect(card).toHaveCount(1);
    await page.waitForTimeout(500); // Allow the column's 220ms transition to finish.
    expect(await page.evaluate(() => scrollY)).toBe(before);
    await expect
      .poll(async () => {
        const box = await card.boundingBox();
        return !!box && box.y >= 0 && box.y + box.height <= 900;
      })
      .toBe(true);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // The phrase is visible, but its aligned card would extend below the viewport.
    await positionHighlight(810);
    const low = await page.evaluate(() => scrollY);
    await highlight.click();
    await expect(card).toHaveCount(1);
    await page.waitForTimeout(500);
    await expect
      .poll(async () => {
        const box = await card.boundingBox();
        return !!box && box.y >= 0 && box.y + box.height <= 900;
      })
      .toBe(true);
    const scrolled = await page.evaluate(() => scrollY);
    expect(scrolled).toBeGreaterThan(low);
    expect(scrolled - low).toBeLessThan(
      (await card.boundingBox())!.height + 100,
    );
  });
}
