import { offlineCss, offlineBundle } from "./offline-harness";
import { expect, test, type Page } from "@playwright/test";
import type { Plugin } from "esbuild";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { statSync } from "node:fs";
import {
  mockModule,
  mockFile,
  STUDENT_ID,
  QUESTION_ID,
  REVIEW_ID,
} from "./admin-revamp-mocks.mjs";

const OUT =
  process.env.ADMIN_REVAMP_OUT ??
  (process.env.CI
    ? "/tmp/admin-revamp-after"
    : "/workspace/claro/revamp/after-admin");

let bundle = "";
let css = "";

function offlinePlugin(): Plugin {
  return {
    name: "admin-revamp-offline",
    setup(builder) {
      const mockFilter =
        /^(server-only|next\/(link|navigation|form|headers|image)|@\/lib\/(auth|admin-data|admin-questions|admin-flashcards|admin-feedback|admin-content|page-metadata)|@\/utils\/supabase\/(server|admin|client)|@\/app\/\(auth\)\/actions|@\/components\/feedback-widget|@\/app\/admin\/(content\/(questions|flashcards)\/actions|marking\/review\/actions|students\/actions|feedback\/actions))$/;

      builder.onResolve({ filter: mockFilter }, ({ path: p }) => ({
        path: p,
        namespace: "admin-mock",
      }));

      // Map @/* -> src/* with extension probe (esbuild does not read tsconfig paths)
      builder.onResolve({ filter: /^@\// }, (args) => {
        const rel = args.path.slice(2);
        const base = path.join(process.cwd(), "src", rel);
        const isFile = (candidate: string) => {
          try {
            return statSync(candidate).isFile();
          } catch {
            return false;
          }
        };
        for (const ext of [
          ".tsx",
          ".ts",
          ".jsx",
          ".js",
          "/index.tsx",
          "/index.ts",
          "",
        ]) {
          const candidate = base + ext;
          if (isFile(candidate)) return { path: candidate };
        }
        return { path: base + ".tsx" };
      });

      // Node-only / optional deps that leak through client trees — stub empty.
      builder.onResolve(
        { filter: /^(node:|@opentelemetry\/|server-only)/ },
        ({ path: p }) => {
          if (p === "server-only") return { path: p, namespace: "admin-mock" };
          return { path: p, namespace: "node-stub" };
        },
      );
      builder.onLoad(
        { filter: /.*/, namespace: "node-stub" },
        ({ path: p }) => {
          if (p === "node:async_hooks" || p === "async_hooks") {
            return {
              contents: `
                export class AsyncLocalStorage {
                  run(store, fn, ...args) {
                    const previous = this.store;
                    this.store = store;
                    try { return fn(...args); }
                    finally { this.store = previous; }
                  }
                  getStore() { return this.store; }
                  exit() {}
                  enterWith() {}
                  disable() {}
                }
                export default { AsyncLocalStorage };
              `,
              loader: "js",
            };
          }
          if (p.startsWith("node:crypto") || p === "crypto") {
            return {
              contents:
                "export const createHash = () => ({ update(){return this}, digest(){return ''} }); export default { createHash };",
              loader: "js",
            };
          }
          // @opentelemetry/* — enough surface for libraries that probe the API
          return {
            contents: `
            const noop = () => {};
            const span = { setAttribute: noop, setStatus: noop, end: noop, recordException: noop, addEvent: noop };
            const tracer = { startSpan: () => span, startActiveSpan: (n, fn) => fn(span) };
            export const context = { active: () => ({}), with: (c, fn) => fn(), bind: (c, fn) => fn };
            export const createContextKey = (name) => Symbol(name);
            export const ROOT_CONTEXT = {};
            export const trace = { getTracer: () => tracer, setSpan: (c) => c, getSpan: () => span };
            export const propagation = { extract: (c) => c, inject: noop };
            export const metrics = { getMeter: () => ({ createCounter: () => ({ add: noop }), createHistogram: () => ({ record: noop }) }) };
            export const diag = { setLogger: noop, debug: noop, info: noop, warn: noop, error: noop };
            export default { context, createContextKey, ROOT_CONTEXT, trace, propagation, metrics, diag };
          `,
            loader: "js",
          };
        },
      );

      builder.onResolve({ filter: /.*/ }, (args) => {
        if (!args.importer) return;
        const imp = args.importer.replace(/\\/g, "/");
        if (!imp.includes("/admin/marking/")) return;
        const resolved = path
          .normalize(path.join(path.dirname(args.importer), args.path))
          .replace(/\\/g, "/");
        const hit =
          /\/marking\/accuracy\/(data|eval)(\.tsx?)?$/.test(resolved) ||
          /\/marking\/review\/(data|actions)(\.tsx?)?$/.test(resolved) ||
          /\/marking\/engine\/(docs|store|compare-data|actions)(\.tsx?)?$/.test(
            resolved,
          );
        if (!hit) return;
        return { path: resolved, namespace: "admin-mock-file" };
      });

      builder.onLoad(
        { filter: /.*/, namespace: "admin-mock" },
        ({ path: p }) => ({
          contents: mockModule(p),
          loader: "tsx",
          resolveDir: process.cwd(),
        }),
      );

      builder.onLoad(
        { filter: /.*/, namespace: "admin-mock-file" },
        ({ path: p }) => ({
          contents: mockFile(p),
          loader: "tsx",
          resolveDir: process.cwd(),
        }),
      );
    },
  };
}

test.beforeAll(async () => {
  css = await offlineCss();

  bundle = await offlineBundle(
    `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {AppShell} from './src/components/app-shell';
        import {Toaster} from 'sonner';
        import {resolve} from './src/test/resolve-server-components';
        import AdminHome from './src/app/admin/page';
        import StudentsPage from './src/app/admin/students/page';
        import StudentDetail from './src/app/admin/students/[id]/page';
        import QuestionsPage from './src/app/admin/content/questions/page';
        import QuestionPage from './src/app/admin/content/questions/[id]/page';
        import FlashcardsPage from './src/app/admin/content/flashcards/page';
        import FeedbackPage from './src/app/admin/feedback/page';
        import AccuracyPage from './src/app/admin/marking/accuracy/page';
        import EnginePage from './src/app/admin/marking/engine/page';
        import ReviewQueue from './src/app/admin/marking/review/page';
        import ReviewPage from './src/app/admin/marking/review/[id]/page';
        import SpendPage from './src/app/admin/spend/page';

        const STUDENT = ${JSON.stringify(STUDENT_ID)};
        const QUESTION = ${JSON.stringify(QUESTION_ID)};
        const REVIEW = ${JSON.stringify(REVIEW_ID)};
        const empty = Promise.resolve({});

        async function pageFor(pathname) {
          if (pathname === '/admin' || pathname === '/admin/') return AdminHome();
          if (pathname === '/admin/students') return StudentsPage({searchParams: empty});
          if (pathname.startsWith('/admin/students/'))
            return StudentDetail({params: Promise.resolve({id: STUDENT}), searchParams: Promise.resolve({tab: 'sessions'})});
          if (pathname === '/admin/content/questions') return QuestionsPage({searchParams: empty});
          if (pathname.startsWith('/admin/content/questions/'))
            return QuestionPage({params: Promise.resolve({id: QUESTION})});
          if (pathname === '/admin/content/flashcards') return FlashcardsPage({searchParams: empty});
          if (pathname === '/admin/feedback') return FeedbackPage({searchParams: empty});
          if (pathname === '/admin/marking/accuracy') return AccuracyPage({searchParams: empty});
          if (pathname === '/admin/marking/engine') return EnginePage({searchParams: Promise.resolve({tab: 'runs'})});
          if (pathname === '/admin/marking/review') return ReviewQueue({searchParams: empty});
          if (pathname.startsWith('/admin/marking/review/'))
            return ReviewPage({params: Promise.resolve({id: REVIEW}), searchParams: empty});
          if (pathname === '/admin/spend') return SpendPage({searchParams: empty});
          return <div>Unknown route {pathname}</div>;
        }

        const tree = await pageFor(location.pathname);
        const resolved = await resolve(tree);
        createRoot(document.getElementById('root')).render(
          <AppShell kind="admin" name="Claro Admin" defaultOpen={true} badges={{}}>
            {resolved}
            <Toaster position="bottom-center" />
          </AppShell>
        );
      `,
    [offlinePlugin()],
    {
      define: {
        "process.env.NODE_ENV": '"test"',
        "process.env": '{"NODE_ENV":"test"}',
        global: "globalThis",
      },
      banner: { js: 'var process={env:{NODE_ENV:"test"}};' },
    },
  );
});

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://claro.test")
      throw new Error("Offline test attempted a network call: " + url.href);
    if (/^\/logos\/[a-z0-9.-]+\.svg$/.test(url.pathname))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: await readFile(`public${url.pathname}`),
      });
    if (url.pathname.endsWith(".woff2"))
      return route.fulfill({
        contentType: "font/woff2",
        body: await readFile("src/app/fonts/claro-sans/ClaroSans[wght].woff2"),
      });
    if (url.pathname === "/__fixture.js")
      return route.fulfill({ contentType: "text/javascript", body: bundle });
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en-AU"><head><style>@font-face{font-family:ClaroSans;src:url(/claro.woff2);font-weight:100 900;font-display:swap}${css}</style><script>window.process={env:{NODE_ENV:"test"}}</script></head><body style="--font-claro-sans:ClaroSans"><div id="root"></div><script type="module" src="/__fixture.js"></script></body></html>`,
    });
  });
});

const routes: {
  path: string;
  file: string;
  heading: string | RegExp;
  dark?: boolean;
}[] = [
  { path: "/admin", file: "admin-dashboard", heading: "Dashboard", dark: true },
  {
    path: "/admin/students",
    file: "admin-students",
    heading: "Students",
    dark: true,
  },
  {
    path: `/admin/students/${STUDENT_ID}`,
    file: "admin-students-id",
    heading: /Ada Lovelace|Sessions/,
    dark: true,
  },
  {
    path: "/admin/content/questions",
    file: "admin-questions",
    heading: "Questions",
    dark: true,
  },
  {
    path: `/admin/content/questions/${QUESTION_ID}`,
    file: "admin-questions-id",
    heading: /Question|hsc-2023|Back to questions/,
    dark: true,
  },
  {
    path: "/admin/content/flashcards",
    file: "admin-flashcards",
    heading: "Flashcards",
    dark: true,
  },
  {
    path: "/admin/feedback",
    file: "admin-feedback",
    heading: /Feedback/,
    dark: true,
  },
  {
    path: "/admin/marking/accuracy",
    file: "admin-accuracy",
    heading: /Marking accuracy|accuracy/i,
    dark: true,
  },
  {
    path: "/admin/marking/engine",
    file: "admin-engine",
    heading: /Engine|Marking engine|Runs/i,
    dark: true,
  },
  {
    path: "/admin/marking/review",
    file: "admin-review",
    heading: /Review|Open/,
    dark: true,
  },
  {
    path: `/admin/marking/review/${REVIEW_ID}`,
    file: "admin-review-id",
    dark: true,
    heading: /Ada Lovelace|Marking review|Back to queue/,
  },
  {
    path: "/admin/spend",
    file: "admin-spend",
    heading: /AI spend|Spend/i,
    dark: true,
  },
];

async function shoot(
  page: Page,
  route: (typeof routes)[number],
  width: number,
  dark: boolean,
) {
  const height = width === 390 ? 844 : 900;
  await page.setViewportSize({ width, height });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://claro.test${route.path}`);
  if (dark)
    await page.locator("html").evaluate((el) => el.classList.add("dark"));
  await expect(page.getByRole("heading").first()).toBeVisible({
    timeout: 15_000,
  });
  if (route.path === "/admin") {
    const sessions = page.locator('[data-slot="card"]').filter({
      has: page.getByRole("heading", {
        name: "Sessions per day",
        exact: true,
      }),
    });
    await expect(sessions.locator('path[fill="none"]')).toHaveAttribute(
      "d",
      /C/,
    );
    // Wave 3: no review queue card, no spend chart, no day pickers.
    await expect(
      page.getByRole("heading", { name: "Review queue", exact: true }),
    ).toHaveCount(0);
    await expect(sessions.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(
      page.locator('[data-component="StatCard"] [data-component="Sparkline"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-component="StatCard"]')).toHaveCount(4);
    await expect(
      page.getByRole("progressbar", {
        name: "Spend this month against the cap",
      }),
    ).toBeVisible();
  }
  if (route.path === "/admin/content/questions") {
    const table = page.getByRole("table", { name: "Questions", exact: true });
    await expect(
      table.getByRole("columnheader", { name: "ID", exact: true }),
    ).toHaveCount(0);
    const source = table.locator(
      `a[href="/admin/content/questions/${QUESTION_ID}"]`,
    );
    await source.focus();
    await expect(source).toBeFocused();
    await expect(source).toBeVisible();
  }
  if (route.path === "/admin/students" && width !== 390) {
    await expect(
      page
        .getByRole("table", { name: "Students", exact: true })
        .getByRole("columnheader", { name: "Blocked", exact: true }),
    ).toHaveCount(0);
  }
  if (route.path === "/admin/students") {
    await expect(
      page.getByRole("link", { name: "Export CSV", exact: true }),
    ).toHaveAttribute("href", "/admin/students/export");
    await expect(
      page.getByRole("button", { name: "More actions" }),
    ).toHaveCount(0);
    await expect(page.getByText("More details")).toHaveCount(0);
    await expect(
      page.getByRole("table", { name: "Students" }).getByRole("checkbox"),
    ).toHaveCount(0);
  }
  if (route.path === `/admin/students/${STUDENT_ID}`) {
    const tabs = page.getByRole("navigation", { name: "Student tabs" });
    await expect(
      tabs.getByRole("link", { name: "Reviews and feedback", exact: true }),
    ).toBeVisible();
    await expect(
      tabs.getByRole("link", { name: "Feedback", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Search", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("From", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/Current streak 4 days · Longest 4 days · 6 active days/),
    ).toBeVisible();
  }
  if (route.path === `/admin/content/questions/${QUESTION_ID}`) {
    await expect(
      page.getByRole("link", { name: "Back to questions", exact: true }),
    ).toHaveCount(1);
  }
  if (route.path === "/admin/content/flashcards" && width !== 390) {
    await expect(page.getByRole("link", { name: "Live (2)" })).toBeVisible();
  }
  if (route.path === "/admin/students" && width === 390) {
    const students = page.getByRole("list", { name: "Students", exact: true });
    await expect(students).toBeVisible();
    await expect(students.getByRole("link").first()).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(
      page.getByRole("table", { name: "Students", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("combobox", { name: "Year", exact: true }).click();
    await expect(
      page.getByRole("option", { name: "Any", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  // Let colour transitions (e.g. after toggling .dark) settle before capture.
  await page.waitForTimeout(600);
  if (width === 390) {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(width);
  }
  const suffix = dark ? `-${width}-dark` : `-${width}`;
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: `${OUT}/${route.file}${suffix}.png`,
    fullPage: true,
  });
  expect(errors, `${route.file} browser errors`).toEqual([]);
}

for (const route of routes) {
  for (const width of [1440, 390] as const) {
    test(`${route.file} light ${width}`, async ({ page }) => {
      await shoot(page, route, width, false);
    });
    if (route.dark) {
      test(`${route.file} dark ${width}`, async ({ page }) => {
        await shoot(page, route, width, true);
      });
    }
  }
}
