import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readTheme, resolveTheme, THEME_KEY, themeScript } from "./theme";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("theme preference and pre-paint script", () => {
  it.each([
    [null, false, false],
    [null, true, true],
    ["system", true, true],
    ["invalid", true, true],
    ["light", true, false],
    ["dark", false, true],
  ])("resolves %s with system dark %s", (preference, system, dark) => {
    expect(resolveTheme(preference, system)).toBe(dark);
    vi.stubGlobal("matchMedia", () => ({ matches: system }));
    if (preference) localStorage.setItem(THEME_KEY, preference);
    expect(readTheme()).toBe(
      preference === "dark" || preference === "light" ? preference : "system",
    );
    // Execute the exact script sent in the head, before React mounts.
    new Function(themeScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(dark);
  });
  it("survives blocked storage and clears an obsolete dark class", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.documentElement.classList.add("dark");
    expect(readTheme()).toBe("system");
    expect(() => new Function(themeScript)()).not.toThrow();
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

// Verify the actual theme tokens, including small status text and chart labels.

const css = readFileSync("src/app/globals.css", "utf8").replace(
  /:root,\s*\.dark/g,
  ":root, .dark",
);
const tokens = (selector: string) =>
  Object.fromEntries(
    [
      ...css
        .split(`${selector} {`)[1]
        .split("}")[0]
        .matchAll(/--([\w-]+): ([^;]+);/g),
    ].map((match) => [match[1], match[2]]),
  );
function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
for (const selector of [":root", ".dark"]) {
  it(`${selector} text tokens meet WCAG AA contrast`, () => {
    const theme = {
      ...tokens(":root"),
      ...tokens(selector),
      ...tokens(":root, .dark"),
    };
    function colour(name: string): string {
      const value = theme[name];
      const alias = value.match(/^var\(--([\w-]+)\)$/);
      if (alias) return colour(alias[1]);
      const mix = value.match(
        /^color-mix\(in srgb, var\(--([\w-]+)\) (\d+)%.*, var\(--([\w-]+)\)\)$/,
      );
      if (!mix) return value;
      const a = colour(mix[1]),
        b = colour(mix[3]),
        weight = Number(mix[2]) / 100;
      return (
        "#" +
        [1, 3, 5]
          .map((i) =>
            Math.round(
              parseInt(a.slice(i, i + 2), 16) * weight +
                parseInt(b.slice(i, i + 2), 16) * (1 - weight),
            )
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
      );
    }
    for (const [ink, background] of [
      ["foreground", "background"],
      ["foreground", "card"],
      ["muted-foreground", "background"],
      ["muted-foreground", "card"],
      ["destructive", "destructive-soft"],
      ["success-text", "success-soft"],
      ["warning-text", "warning-soft"],
      ["foreground", "surface"],
      ["brand-text", "brand-soft"],
      ["sidebar-foreground", "sidebar"],
      ...(selector === ".dark" ? [["primary-foreground", "primary"]] : []),
    ]) {
      const a = luminance(colour(ink)),
        b = luminance(colour(background));
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        `${ink} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
}
