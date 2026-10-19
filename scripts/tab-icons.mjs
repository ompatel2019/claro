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
  for (const size of [...sizes, 180]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html>
      <style>body { margin: 0; } svg { display: block; width: ${size}px; height: ${size}px; }</style>
      ${svg}`);
    const png = await page.screenshot({ omitBackground: true });
    if (size === 180) {
      // Flatten the full-size transparent render onto the warm white iOS tile.
      await page.setContent(
        '<style>body { margin: 0; } canvas { display: block; }</style><canvas width="180" height="180"></canvas>',
      );
      await page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const context = document.querySelector("canvas").getContext("2d");
        context.fillStyle = "#fffdfb";
        context.fillRect(0, 0, 180, 180);
        context.drawImage(image, 0, 0);
      }, png.toString("base64"));
      await page.screenshot({ path: appFile("apple-icon.png").pathname });
    } else {
      images.push(png);
    }
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
