import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import * as icons from "./icons";

const glyphs = Object.entries(icons) as [string, icons.Icon][];

it("draws every icon in the one Claro style", () => {
  for (const [name, Glyph] of glyphs) {
    const svg = render(<Glyph className="size-4" />).container.querySelector(
      "svg",
    )!;
    expect(svg.getAttribute("viewBox"), name).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke"), name).toBe("currentColor");
    expect(svg.getAttribute("stroke-width"), name).toBe("1.75");
    expect(svg.getAttribute("stroke-linecap"), name).toBe("round");
    expect(svg.getAttribute("aria-hidden"), name).toBe("true");
    expect(svg.getAttribute("class"), name).toBe("size-4");
  }
});

it("keeps only icons that are used, and no stock icon library", () => {
  const files = execSync("grep -rlF '@/components/icons' src --include=*.tsx")
    .toString()
    .split("\n")
    .filter((f) => f && !f.endsWith(".test.tsx"));
  const src = files
    .flatMap((f) => [
      ...readFileSync(f, "utf8").matchAll(
        /import [^;]*?from "@\/components\/icons"/g,
      ),
    ])
    .join("\n");
  for (const [name] of glyphs)
    expect(src, `${name} is unused`).toMatch(new RegExp(`\\b${name}\\b`));
  expect(
    execSync(
      "grep -rl --exclude=icons.test.tsx lucide src package.json || true",
    ).toString(),
  ).toBe("");
});

it("uses the same glyph contract for student navigation", () => {
  const set = [icons.Sprint, icons.Cards, icons.Pen, icons.History];
  const { container } = render(
    <>
      {set.map((Glyph, index) => (
        <Glyph key={index} size={32} />
      ))}
    </>,
  );
  expect(container.querySelectorAll("svg")).toHaveLength(4);
  for (const svg of container.querySelectorAll("svg")) {
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
    expect(svg).toHaveAttribute("stroke-linejoin", "round");
    expect(svg.querySelector("path,rect")).not.toBeNull();
  }
});

it("covers the supported portal glyph vocabulary", () => {
  const names = [
    "arrow-down-right",
    "arrow-left",
    "arrow-right",
    "arrow-up",
    "arrow-up-right",
    "book-open",
    "calculator",
    "camera",
    "chart-line",
    "check",
    "chevron-left",
    "chevron-right",
    "chevrons-up-down",
    "circle-alert",
    "circle-check",
    "circle-dot",
    "circle-half",
    "chevron-down",
    "more",
    "x",
    "clock",
    "copy",
    "corner-down-left",
    "ellipsis",
    "file-question",
    "flag",
    "graduation-cap",
    "history",
    "hourglass",
    "inbox",
    "keyboard",
    "layers",
    "layout-grid",
    "list",
    "list-checks",
    "lock",
    "menu",
    "message-circle",
    "mic",
    "minus",
    "moon",
    "panel-left",
    "pen-line",
    "play",
    "plus",
    "refresh-cw",
    "rotate-ccw",
    "search",
    "sparkles",
    "sun",
    "table",
    "table-2",
    "tag",
    "target",
    "timer",
    "trending-up",
    "user",
    "users",
    "zap",
  ] as const;
  for (const name of names) {
    const { container, unmount } = render(<icons.PortalIcon name={name} />);
    expect(container.querySelector("svg"), name).toHaveAttribute(
      "data-icon",
      name,
    );
    expect(container.querySelector("path"), name).toHaveAttribute("d");
    unmount();
  }
});
