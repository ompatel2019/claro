import { offlineCss, offlineBundle } from "./offline-harness";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
let bundle: string, css: string;
test.beforeAll(async () => {
  css = await offlineCss();
  bundle = await offlineBundle(
    `import React from 'react';import {createRoot} from 'react-dom/client';import {AppShell} from './src/components/app-shell';import {Kit} from './src/components/claro/kit';import {Toaster} from 'sonner';import {FeedbackWidget} from './src/components/feedback-widget';createRoot(document.getElementById('root')).render(<FeedbackWidget userId="offline-student"><AppShell kind={location.search.includes('admin')?'admin':'student'} name="Claro Test Student" defaultOpen={true}><Kit/><Toaster/></AppShell></FeedbackWidget>);`,
    [
      {
        name: "offline-shell",
        setup(builder) {
          builder.onResolve(
            {
              filter: /^(next\/(link|navigation)|@\/app\/\(auth\)\/actions)$/,
            },
            ({ path }) => ({ path, namespace: "mock" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
            contents:
              path === "next/link"
                ? `import React from 'react';export default function Link({href,prefetch,...props}){return <a href={href} {...props}/>}`
                : path === "next/navigation"
                  ? `export const usePathname=()=>location.pathname;export const useRouter=()=>({push:url=>{history.pushState({},'',url);window.dispatchEvent(new Event('navigated'));}});`
                  : `export const signOut=()=>{};`,
            loader: "tsx",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  );
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://claro.test")
      throw new Error("Foundation tests must stay offline");
    if (/^\/logos\/[a-z-]+\.svg$/.test(url.pathname))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: await readFile(`public${url.pathname}`),
      });
    if (url.pathname === "/fixture.js")
      return route.fulfill({ contentType: "text/javascript", body: bundle });
    if (url.pathname.endsWith(".woff2"))
      return route.fulfill({
        contentType: "font/woff2",
        body: await readFile(
          url.pathname === "/serif.woff2"
            ? "src/app/fonts/InstrumentSerif-Regular.woff2"
            : url.pathname === "/hand.woff2"
              ? "src/app/fonts/Caveat-Variable.woff2"
              : "src/app/fonts/claro-sans/ClaroSans[wght].woff2",
        ),
      });
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en-AU"><head><style>@font-face{font-family:ClaroSans;src:url(/claro.woff2);font-weight:300 800;font-display:swap}@font-face{font-family:InstrumentSerif;src:url(/serif.woff2);font-weight:400;font-display:swap}@font-face{font-family:Caveat;src:url(/hand.woff2);font-weight:400 700;font-display:swap}${css}</style></head><body style="--font-claro-sans:ClaroSans;--font-instrument-serif:InstrumentSerif;--font-caveat:Caveat"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`,
    });
  });
});
for (const width of [1440, 390])
  test(`foundation at ${width}px: shell, tokens, search, feedback and dark mode`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://claro.test/student/kit");
    await expect(
      page.getByRole("heading", { name: "UI kit", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("button", { name: "Default", exact: true }).first(),
    ).toHaveCSS("background-color", "rgb(30, 34, 61)");
    await expect(
      page.getByRole("button", { name: "Study", exact: true }),
    ).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(
      page.getByRole("combobox", { name: "Example select" }),
    ).toContainText("Select");
    expect(
      await page
        .locator('img[src="/logos/claro-logo-primary-on-light.svg"]')
        .first()
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    ).toBe(true);
    if (width === 390) {
      await page.getByRole("button", { name: "More navigation" }).click();
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Control+k");
    const search = page.getByRole("combobox", { name: "Search pages" });
    await expect(search).toBeFocused();
    await search.fill("Progress");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/student\/progress$/);
    await expect(
      page.getByRole("button", { name: "Ask Claro", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("Control+k");
    await page
      .getByRole("combobox", { name: "Search pages" })
      .fill("Ask Claro");
    await expect(page.getByRole("option")).toHaveCount(0);
    await page.keyboard.press("Escape");
    if (width === 390)
      await page.getByRole("button", { name: "More navigation" }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("button", { name: "Send feedback", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Send feedback" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeEditable();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    if (width === 390)
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).not.toBeVisible();
    await page.getByRole("button", { name: "Dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(19, 21, 43)");
    await page.screenshot({
      path: `/tmp/claro-foundation-${width}-dark.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Dark mode" }).click();
    await page.screenshot({
      path: `/tmp/claro-foundation-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
test("admin search keeps the original 380 by 36 control from sm", async ({
  page,
}) => {
  for (const width of [640, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://claro.test/admin?admin");
    const search = page.getByRole("button", { name: /Search pages/ });
    await expect(search).toBeVisible();
    const box = await search.boundingBox();
    expect(box!.width).toBe(380);
    expect(box!.height).toBe(36);
    await expect(
      search.getByText("Search questions, topics and cards"),
    ).toBeVisible();
  }
});
test("admin search includes real admin routes", async ({ page }) => {
  await page.goto("http://claro.test/admin?admin");
  await page.keyboard.press("Meta+k");
  await page
    .getByRole("combobox", { name: "Search pages" })
    .fill("Review queue");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/marking\/review$/);
});

test("phone feedback and secondary-route tabs stay distinct", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/student",
    "/student/activity",
    "/student/activity/synthetic-result",
    "/student/flashcards",
    "/student/mark",
    "/student/profile",
  ]) {
    await page.goto(`http://claro.test${path}`);
    const tabs = page.getByRole("navigation", { name: "Phone navigation" });
    await expect(tabs.getByRole("link")).toHaveText([
      "Home",
      "Sprint",
      "Progress",
      "Feedback",
    ]);
    await expect(tabs.getByRole("link", { name: "Feedback" })).toHaveAttribute(
      "href",
      "/student/activity",
    );
    const current = tabs.locator('[aria-current="page"]');
    await expect(current).toHaveText(
      path === "/student"
        ? "Home"
        : path.includes("activity")
          ? "Feedback"
          : "More",
    );
    await expect(current.locator(".nav-pen")).toHaveCount(1);
  }
  await page.getByRole("button", { name: "More navigation" }).click();
  const drawer = page.getByRole("navigation", { name: "Main navigation" });
  for (const label of ["Flashcards", "Mark my answer", "Activity"])
    await expect(
      drawer.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Profile", exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Send feedback", exact: true }),
  ).toBeVisible();
});
