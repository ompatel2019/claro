import { readFileSync } from "node:fs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Dashboard, Target } from "@/components/icons";
import { CommandPalette } from "./command-palette";
import { Meter, ScoreRing, Sparkline } from "./data-display";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  cleanup();
  push.mockClear();
});
it("preserves every template light and dark token, except font families", () => {
  const template = readFileSync("src/test/fixtures/claro-tokens.css", "utf8");
  const css = readFileSync("src/app/globals.css", "utf8");
  for (const selector of [":root", ".dark"]) {
    const block = (text: string) =>
      text.slice(text.indexOf(`${selector} {`)).split("}")[0];
    for (const [, name, value] of block(template).matchAll(
      /(--[\w-]+):\s*([^;]+);/g,
    ))
      expect(block(css).toLowerCase(), name).toContain(
        `${name}: ${value.trim()};`.toLowerCase(),
      );
  }
  expect(css).toMatch(/--brand: #f54f1b/i);
  expect(css).not.toMatch(/Hanken Grotesk|Space Mono/i);
});
it.each(["metaKey", "ctrlKey"])(
  "opens search with %s, filters and navigates using the keyboard",
  async (modifier) => {
    render(
      <CommandPalette
        routes={[
          { label: "Home", href: "/student", icon: Dashboard },
          { label: "Progress", href: "/student/progress", icon: Target },
        ]}
      />,
    );
    fireEvent.keyDown(window, { key: "k", [modifier]: true });
    const search = await screen.findByRole("combobox");
    fireEvent.change(search, { target: { value: "progress" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/student/progress");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
);
it.each([false, true])(
  "scopes search sizing to the student shell (%s)",
  (student) => {
    render(<CommandPalette routes={[]} student={student} />);
    const trigger = screen.getByRole("button", { name: /Search pages/ });
    expect(trigger).toHaveClass(student ? "md:h-10" : "sm:h-9");
    expect(trigger).toHaveClass(student ? "md:max-w-[420px]" : "sm:w-[380px]");
    expect(trigger.querySelector("span")).toHaveClass(
      student ? "md:block" : "sm:block",
    );
  },
);
it("shows a useful empty search result", async () => {
  render(<CommandPalette routes={[]} />);
  fireEvent.click(screen.getByRole("button", { name: /Search pages/ }));
  expect(await screen.findByText(/No pages match/)).toBeVisible();
});
it("clamps meters and renders empty data without invalid SVG coordinates", () => {
  const { container } = render(
    <>
      <Meter value={150} label="Mastery" />
      <ScoreRing score={0} of={0} />
      <Sparkline values={[]} />
      <Sparkline values={[3]} />
    </>,
  );
  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
});
