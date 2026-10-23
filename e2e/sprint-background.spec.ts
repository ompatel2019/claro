import { expect, test, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";

// Render the real runner with synthetic auth/storage. All marking/finish HTTP is
// intercepted below: this browser regression needs neither credentials nor AI.
let runner: string;
test.beforeAll(async () => {
  const attempts = Array.from({ length: 4 }, (_, index) => ({
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
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import { SprintRunner } from './src/components/sprint-runner';
      import { MarkMyAnswer } from './src/components/mark-my-answer';
      createRoot(document.getElementById('root')).render(location.pathname === '/__mark-test' ? <MarkMyAnswer questions={[{id:'q',type:'short',stem:'Explain inflation.',marks:4,source:'Synthetic',year:2025,topic_id:'t',stimulus:null,options:null,verb:'explain'}]} topics={[]} userId='synthetic' left={20}/> : <SprintRunner
        session={{id:'s',kind:'sprint',config:{mode:'short',feedback:'end'},elapsed_s:0}}
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
            { filter: /^@\/app\/\(app\)\/student\/mark\/actions$/ },
            ({ path }) => ({ path, namespace: "mark-actions" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "mark-actions" }, () => ({
            contents: `export const createCheck=()=>new Promise(resolve=>window.__resolveCreate=resolve); export const finishCheck=async()=>({error:null}); export const restoreUnreadableCheck=async()=>({});`,
          }));
          builder.onResolve(
            {
              filter:
                /^(next\/(navigation|link)|@\/utils\/supabase\/client|@\/lib\/auth-client)$/,
            },
            ({ path }) => ({ path, namespace: "mock" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
            contents:
              path === "next/navigation"
                ? "export const useRouter=()=>({push(){}}); export const usePathname=()=>'/student/sprint/s';"
                : path === "next/link"
                  ? "export default function Link(){return null;}"
                  : path.endsWith("auth-client")
                    ? "export const ensureSession=async()=>{}; export const withAuthRetry=(_db,fn)=>fn();"
                    : `const chain={update(){return this},eq(){return this},in(){return this},
            is:async()=>({error:null}),maybeSingle:async()=>({data:window.__finished ? {finished_at:'2026-10-19'} : null,error:null}),select(){return this},then(resolve){resolve({data:[{id:'a'}],error:null})}};
            export const createClient=()=>({from:()=>chain});`,
          }));
        },
      },
    ],
  });
  runner = result.outputFiles[0].text;
});

test("queues background marks, keeps edits usable, and waits at Finish", async ({
  page,
}) => {
  const held: (() => Promise<void>)[] = [];
  const marks: string[] = [];
  const saved: Record<string, string> = {};
  let finishCalls = 0;
  await page.route("**/api/attempts/**", async (route) => {
    const id = route
      .request()
      .url()
      .match(/attempts\/(a\d)/)![1];
    if (route.request().method() === "PATCH") {
      const patch = route.request().postDataJSON();
      if (patch.answer_text !== undefined) saved[id] = patch.answer_text;
      await route.fulfill({ json: { saved: true } });
      return;
    }
    expect(route.request().url()).toMatch(/\/mark$/);
    marks.push(id);
    const failed = marks.length === 1;
    held.push(() =>
      route.fulfill({ status: failed ? 500 : 200, json: { status: "marked" } }),
    );
  });
  await page.route("**/api/sessions/s/finish", async (route) => {
    finishCalls++;
    await route.fulfill({ json: { finished: true } });
  });
  await page.route("**/student/activity/s", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "Synthetic results",
    }),
  );
  await page.route("**/__sprint-background-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><div id="root"></div>',
    }),
  );
  await page.goto("/__sprint-background-test");
  await page.addScriptTag({ content: runner });
  const answer = page.getByRole("textbox", { name: "Your answer" });
  const move = async (question: number) => {
    await page
      .getByRole("navigation", { name: "Question progress" })
      .getByRole("button", { name: new RegExp(`^Question ${question},`) })
      .click();
    await expect(
      page.getByText(`Explain effect ${question}.`, { exact: true }),
    ).toBeVisible();
  };
  for (let i = 1; i <= 3; i++) {
    await answer.fill(`Synthetic answer number ${i}`);
    await move(i + 1);
  }
  await expect.poll(() => marks.length).toBe(2);
  await expect(answer).toBeEnabled();
  // Editing while an old version is running remains possible and saves first.
  await move(1);
  await answer.fill("The final edited answer");
  await move(4);
  await expect.poll(() => saved.a0).toBe("The final edited answer");
  await held.shift()!();
  await expect.poll(() => marks.length).toBe(3);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await answer.fill("The final current answer");
  await page
    .getByRole("button", { name: "Finish", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Finish and mark?" })
    .getByRole("button", { name: "Finish and mark", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => saved.a3).toBe("The final current answer");
  expect(finishCalls).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Marking your answers", exact: true }),
  ).toBeVisible();
  await held.shift()!();
  await held.shift()!();
  await expect.poll(() => finishCalls).toBe(1);
  expect(marks).toEqual(["a0", "a1", "a0"]);
  await expect(page).toHaveURL(/\/student\/activity\/s$/);
  await expect(page.getByText("Synthetic results")).toBeVisible();
});

const LEAVE =
  "Leaving ends this sprint. Your answered questions will be marked.";

// No resume: leaving an active sprint asks first, and confirming finishes it.
async function openGuarded(page: Page, finished: { calls: number }) {
  await page.route("**/api/attempts/**", (route) =>
    route.fulfill({ json: { saved: true, status: "marked" } }),
  );
  await page.route("**/api/sessions/s/finish", async (route) => {
    finished.calls++;
    await route.fulfill({ json: { finished: true } });
  });
  await page.route("**/student/activity/s", (route) =>
    route.fulfill({ contentType: "text/html", body: "Synthetic results" }),
  );
  await page.route("**/__leave-guard", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><a href="/student">Synthetic home</a><div id="root"></div>',
    }),
  );
  await page.goto("/__leave-guard");
  await page.addScriptTag({ content: runner });
  await page.getByRole("textbox", { name: "Your answer" }).fill("Answered");
}

// The harness has no stylesheet, so the dialog backdrop overlaps its buttons: use the keyboard.
async function press(button: Locator) {
  await button.focus();
  await button.press("Enter");
}

test("Exit asks first; Keep working stays, Leave and mark finishes", async ({
  page,
}) => {
  const finished = { calls: 0 };
  await openGuarded(page, finished);
  await page.getByRole("button", { name: "Exit sprint" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Leave this sprint?" });
  await expect(dialog).toContainText(LEAVE);
  await press(dialog.getByRole("button", { name: "Keep working" }));
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/__leave-guard$/);
  expect(finished.calls).toBe(0);
  await page.getByRole("button", { name: "Exit sprint" }).click();
  await press(dialog.getByRole("button", { name: "Leave and mark" }));
  await expect.poll(() => finished.calls).toBe(1);
  await expect(page).toHaveURL(/\/student\/activity\/s$/);
});

test("in-app links and Back ask before leaving", async ({ page }) => {
  const finished = { calls: 0 };
  await openGuarded(page, finished);
  const dialog = page.getByRole("alertdialog", { name: "Leave this sprint?" });
  await page.getByRole("link", { name: "Synthetic home" }).click();
  await expect(dialog).toContainText(LEAVE);
  await expect(page).toHaveURL(/__leave-guard$/);
  await press(dialog.getByRole("button", { name: "Keep working" }));
  await page.goBack();
  await expect(dialog).toContainText(LEAVE);
  await expect(page).toHaveURL(/__leave-guard$/);
  expect(finished.calls).toBe(0);
});

test("closing the tab asks with the browser prompt", async ({ page }) => {
  const finished = { calls: 0 };
  await openGuarded(page, finished);
  const prompt = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
});

for (const outcome of ["error", "recovered", "network"] as const)
  test(`runner Finish recovery: ${outcome}`, async ({ page }) => {
    await page.route("**/api/attempts/**", (route) =>
      route.fulfill({ json: { saved: true, status: "marked" } }),
    );
    await page.route("**/api/sessions/s/finish", (route) =>
      outcome === "network"
        ? route.abort("failed")
        : route.fulfill({ status: 500, json: { error: "Finish timed out" } }),
    );
    await page.route("**/student/activity/s", (route) =>
      route.fulfill({ contentType: "text/html", body: "Synthetic results" }),
    );
    await page.route("**/__runner-recovery", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><div id="root"></div>',
      }),
    );
    await page.goto("/__runner-recovery");
    if (outcome === "recovered")
      await page.evaluate(() => Object.assign(window, { __finished: true }));
    await page.addScriptTag({ content: runner });
    const answer = page.getByRole("textbox", { name: "Your answer" });
    await answer.fill("My saved answer");
    await page
      .getByRole("button", { name: "Finish", exact: true })
      .first()
      .click();
    await page
      .getByRole("dialog", { name: "Finish and mark?" })
      .getByRole("button", { name: "Finish and mark", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    if (outcome === "recovered")
      await expect(page).toHaveURL(/\/student\/activity\/s$/);
    else {
      await expect(page.getByRole("alert")).toContainText(
        outcome === "network" ? "Failed to fetch" : "Finish timed out",
      );
      await expect(answer).toBeEnabled();
      await expect(answer).toHaveValue("My saved answer");
      await page.getByRole("link", { name: "View results" }).click();
      await expect(page).toHaveURL(/\/student\/activity\/s$/);
    }
  });

test("Mark my answer uses the shared screen and keeps the draft after submission failure", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/__mark-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><div id="root"></div>',
    }),
  );
  await page.goto("/__mark-test");
  await page.addScriptTag({ content: runner });
  await page.getByRole("option", { name: /Explain inflation/ }).click();
  const answer = page.getByRole("textbox", { name: "Your answer" });
  await answer.fill("Demand rises faster than supply.");
  await page
    .getByRole("button", { name: "Mark my answer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Marking your answer", exact: true }),
  ).toBeVisible();
  await expect(answer).toBeHidden();
  await page.evaluate(() => {
    (
      window as unknown as { __resolveCreate: (value: unknown) => void }
    ).__resolveCreate({ error: "Submission unavailable" });
  });
  await expect(page.getByRole("alert")).toContainText("Submission unavailable");
  await expect(
    page.getByRole("heading", { name: "Marking your answer", exact: true }),
  ).toHaveCount(0);
  await expect(answer).toBeVisible();
  await expect(answer).toHaveValue("Demand rises faster than supply.");
});
