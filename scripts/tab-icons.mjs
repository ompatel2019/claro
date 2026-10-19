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
  // Canvas PNGs are always RGBA, which Next's ICO decoder requires.
  for (const size of sizes) {
    const data = await page.evaluate(
      async ([svg, size]) => {
        const image = new Image();
        image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
        await image.decode();
        const canvas = Object.assign(document.createElement("canvas"), {
          width: size,
          height: size,
        });
        canvas.getContext("2d").drawImage(image, 0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      [svg, size],
    );
    images.push(Buffer.from(data, "base64"));
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
