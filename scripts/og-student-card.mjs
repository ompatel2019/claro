import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const logo = await readFile(
  new URL("../public/logos/claro-wordmark-on-dark.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html>
    <html lang="en"><meta charset="utf-8">
    <style>
      body {
        margin: 0; width: 1200px; height: 630px; background: #1e223d;
        color: #fffdfb; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 48px;
      }
      svg { display: block; width: 440px; height: auto; }
      p { margin: 0; font: 700 44px/1.2 Arial, sans-serif; }
      body::after {
        content: ""; position: absolute; bottom: 88px;
        width: 72px; height: 6px; background: #f54f1b;
      }
    </style>
    <body>${logo}<p>HSC Economics, marked in seconds.</p></body></html>`);
  await page.screenshot({
    path: new URL("../public/og/claro-student-og.png", import.meta.url)
      .pathname,
  });
} finally {
  await browser.close();
}
