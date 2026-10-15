import { expect, test } from "@playwright/test";
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
      createRoot(document.getElementById('root')).render(<SprintRunner
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
            is:async()=>({error:null}),select:async()=>({data:[{id:'a'}],error:null})};
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
  await page.route("**/student/sprint/s/results", (route) =>
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
      .getByRole("navigation", { name: "Question booklet" })
      .getByRole("button", { name: new RegExp(`^Question ${question}:`) })
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
  await held.shift()!();
  await held.shift()!();
  await expect.poll(() => finishCalls).toBe(1);
  expect(marks).toEqual(["a0", "a1", "a0"]);
  await expect(page).toHaveURL(/\/student\/sprint\/s\/results$/);
  await expect(page.getByText("Synthetic results")).toBeVisible();
});
