import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";
let bundle: string, css: string;
test.beforeAll(async () => {
  css = (
    await postcss([tailwind()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
  bundle = (
    await build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AppShell} from './src/components/app-shell';import {Kit} from './src/components/claro/kit';import {Toaster} from 'sonner';createRoot(document.getElementById('root')).render(<AppShell kind={location.search.includes('admin')?'admin':'student'} name="Claro Test Student" defaultOpen={true}><Kit/><Toaster/></AppShell>);`,
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
          name: "offline-shell",
          setup(builder) {
            builder.onResolve(
              {
                filter:
                  /^(next\/(link|navigation)|@\/app\/\(auth\)\/actions|@\/components\/feedback-widget)$/,
              },
              ({ path }) => ({ path, namespace: "mock" }),
            );
            builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
              contents:
                path === "next/link"
                  ? `import React from 'react';export default function Link({href,prefetch,...props}){return <a href={href} {...props}/>}`
                  : path === "next/navigation"
                    ? `export const usePathname=()=>location.pathname;export const useRouter=()=>({push:url=>{history.pushState({},'',url);window.dispatchEvent(new Event('navigated'));}});`
                    : path.includes("actions")
                      ? `export const signOut=()=>{};`
                      : `export const HeaderFeedback=()=>null;`,
              loader: "tsx",
              resolveDir: process.cwd(),
            }));
          },
        },
      ],
    })
  ).outputFiles[0].text;
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
        body: await readFile("src/app/fonts/claro-sans/ClaroSans[wght].woff2"),
      });
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en-AU"><head><style>@font-face{font-family:ClaroSans;src:url(/claro.woff2);font-weight:100 900;font-display:swap}${css}</style></head><body style="--font-claro-sans:ClaroSans"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`,
    });
  });
});
for (const width of [1440, 390])
  test(`foundation at ${width}px: shell, tokens, search, chat and dark mode`, async ({
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
    ).toHaveCSS("background-color", "rgb(27, 31, 52)");
    await expect(
      page.getByRole("button", { name: "Study", exact: true }),
    ).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(
      page.getByRole("combobox", { name: "Example select" }),
    ).toContainText("Select");
    expect(
      await page
        .locator('img[src="/logos/claro-lockup.svg"]')
        .first()
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    ).toBe(true);
    if (width === 390) {
      await page.getByRole("button", { name: "Toggle Sidebar" }).click();
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
    await page.getByRole("button", { name: "Ask Claro", exact: true }).click();
    await page.getByRole("button", { name: /Explain the J-curve/ }).click();
    await expect(page.getByRole("log")).toContainText(
      "A depreciation can initially worsen",
    );
    await page.getByRole("textbox", { name: "Message Claro" }).fill("hello");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("log")).toContainText(
      "Try breaking the concept",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(16, 18, 26)");
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
test("admin search includes real admin routes", async ({ page }) => {
  await page.goto("http://claro.test/admin?admin");
  await page.keyboard.press("Meta+k");
  await page
    .getByRole("combobox", { name: "Search pages" })
    .fill("Review queue");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/marking\/review$/);
});
