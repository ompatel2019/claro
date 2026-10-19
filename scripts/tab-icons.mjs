import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const appFile = (name) => new URL(`../src/app/${name}`, import.meta.url);
const svg = await readFile(appFile("icon.svg"), "utf8");
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const sizes = [16, 32, 48];
  const images = [];
  // favicon.ico only; apple-icon.png is the marketing site's file, copied as-is.
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html>
      <style>body { margin: 0; } svg { display: block; width: ${size}px; height: ${size}px; }</style>
      ${svg}`);
    images.push(await page.screenshot({ omitBackground: true }));
  }

  // ICONDIR followed by one ICONDIRENTRY per embedded PNG.
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((png, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index];
    header[entry + 1] = sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await writeFile(appFile("favicon.ico"), Buffer.concat([header, ...images]));
} finally {
  await browser.close();
}
