import { expect, test } from "@playwright/test";
import { build } from "esbuild";

// Item 16: closing the marking screen never stops Finish, and Activity shows the sprint as
// Marking until its result is in. The real runner and Activity rows render with synthetic
// auth/storage; all finish/marking HTTP is intercepted, so no credentials or AI are needed.
let bundle: string;
test.beforeAll(async () => {
  const attempts = Array.from({ length: 2 }, (_, index) => ({
    id: `a${index}`,
    question_id: `q${index}`,
    position: index + 1,
    status: "pending",
    choice_index: null,
    answer_text: null,
    transcript: null,
    image_paths: null,
    flagged: false,
    mark: null,
    max_marks: null,
    band: null,
    feedback: null,
    question: {
      id: `q${index}`,
      type: "short",
      marks: 4,
      stem: `Explain effect ${index + 1}.`,
      topic_id: "t",
      source: "Synthetic",
      options: null,
      stimulus: null,
      year: null,
    },
  }));
  const row = {
    id: "s",
    kind: "sprint",
    paper_id: null,
    title: "Short answer sprint",
    provisional: false,
    study: false,
    items: 2,
    answered: 2,
    elapsed_s: 120,
    started_at: "2026-10-24T01:00:00Z",
  };
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import { SprintRunner } from './src/components/sprint-runner';
      import { SessionList } from './src/components/student/activity/session-list';
      const row = ${JSON.stringify(row)};
      const done = window.__finished;
      const rows = [{ ...row, status: done ? 'Finished' : 'Marking', pct: done ? 75 : null,
        finished_at: done ? '2026-10-24T01:05:00Z' : null }];
      const details = done ? { s: { id: 's', kind: 'sprint', config: {}, score: 3, max_score: 4 } } : {};
      createRoot(document.getElementById('root')).render(location.pathname === '/__activity'
        ? <SessionList rows={rows} details={details} today="2026-10-24" sort="newest" />
        : <SprintRunner session={{id:'s',kind:'sprint',config:{mode:'short',feedback:'end'},elapsed_s:0}}
            initial={${JSON.stringify(attempts)}} userId="u" title="Synthetic sprint" />);`,
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
        name: "synthetic-auth",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(next\/(navigation|link)|@\/utils\/supabase\/client|@\/lib\/auth-client)$/,
            },
            ({ path }) => ({ path, namespace: "mock" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
            loader: "tsx",
            resolveDir: process.cwd(),
            contents:
              path === "next/navigation"
                ? "export const useRouter=()=>({push(){},refresh(){}}); export const usePathname=()=>'/student/sprint/s';"
                : path === "next/link"
                  ? "export default function Link({prefetch, ...props}){return <a {...props} />;}"
                  : path.endsWith("auth-client")
                    ? "export const ensureSession=async()=>{}; export const withAuthRetry=(_db,fn)=>fn();"
                    : `const chain={update(){return this},eq(){return this},in(){return this},
            is:async()=>({error:null}),maybeSingle:async()=>({data:null,error:null}),select(){return this},then(resolve){resolve({data:[{id:'a'}],error:null})}};
            export const createClient=()=>({from:()=>chain});`,
          }));
        },
      },
    ],
  });
  bundle = result.outputFiles[0].text;
});

const html = '<!doctype html><div id="root"></div>';

test("closing the marking screen leaves Finish running; Activity shows Marking, then the result", async ({
  page,
  context,
}) => {
  const marks: string[] = [];
  const finishes: string[] = [];
  await page.route("**/api/attempts/**", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ json: { saved: true } });
      return;
    }
    // A background mark that is still running when Finish is pressed (never answered).
    marks.push(route.request().url());
  });
  // The server's Finish run outlives the tab: it is never answered here either.
  await page.route("**/api/sessions/s/finish", (route) => {
    finishes.push(route.request().method());
  });
  await page.route("**/__runner", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("/__runner");
  await page.addScriptTag({ content: bundle });
  const answer = page.getByRole("textbox", { name: "Your answer" });
  await answer.fill("Synthetic answer number one");
  await page
    .getByRole("navigation", { name: "Question progress" })
    .getByRole("button", { name: /^Question 2,/ })
    .click();
  await expect.poll(() => marks.length).toBe(1);
  await answer.fill("Synthetic answer number two");
  await page
    .getByRole("button", { name: "Finish", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Finish and mark?" })
    .getByRole("button", { name: "Finish and mark", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Marking your answers", exact: true }),
  ).toBeVisible();
  // Finish is sent while the background mark is still running, not after it.
  await expect.poll(() => finishes).toEqual(["POST"]);
  // Closing the marking screen does not ask to stay: the server owns marking now.
  let prompted = false;
  page.on("dialog", (dialog) => {
    prompted = true;
    void dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  expect(prompted).toBe(false);
  expect(finishes).toEqual(["POST"]);

  // Back on Activity while the run is marking: a Marking row with no score, opening results.
  const activity = await context.newPage();
  await activity.route("**/__activity", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await activity.goto("/__activity");
  await activity.addScriptTag({ content: bundle });
  const item = activity.getByRole("listitem").filter({
    hasText: "Short answer sprint",
  });
  await expect(item.getByText("Marking", { exact: true })).toBeVisible();
  await expect(item.getByText("%")).toHaveCount(0);
  await expect(
    item.getByRole("link", { name: "Short answer sprint" }),
  ).toHaveAttribute("href", "/student/activity/s");

  // Once the run finishes, the same row shows the score and still opens the results.
  await activity.reload();
  await activity.evaluate(() => Object.assign(window, { __finished: true }));
  await activity.addScriptTag({ content: bundle });
  await expect(item.getByText("Marking", { exact: true })).toHaveCount(0);
  await expect(item.getByText("75%")).toBeVisible();
  await expect(item).toContainText("3/4");
  await expect(
    item.getByRole("link", { name: "Short answer sprint" }),
  ).toHaveAttribute("href", "/student/activity/s");
});
