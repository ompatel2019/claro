import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ScanResult, ScanState } from "@/hooks/use-scan-to-text";

const hook = vi.hoisted(() => ({
  scan: vi.fn(),
  state: "idle" as ScanState,
  error: "",
  retryAt: 0,
}));
vi.mock("@/hooks/use-scan-to-text", () => ({
  useScanToText: () => ({ ...hook, cancel: vi.fn() }),
}));
import { ScanToText } from "./scan-to-text";

const scanned: ScanResult = {
  text: "Tariffs raise[?] import prices.",
  uncertain: 1,
  notes: "",
};
let reduced = true;
const writes: string[] = [];

function Box({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <textarea aria-label="Your answer" value={value} readOnly />
      <ScanToText
        attemptId="a1"
        value={value}
        onText={(text) => {
          writes.push(text);
          setValue(text);
        }}
      />
    </>
  );
}
const choose = async () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async () => {
    fireEvent.change(input, {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });
  });
};
const box = () => screen.getByLabelText<HTMLTextAreaElement>("Your answer");

beforeEach(() => {
  Object.assign(hook, { state: "idle", error: "", retryAt: 0 });
  hook.scan.mockReset().mockResolvedValue(scanned);
  writes.length = 0;
  reduced = true;
  window.matchMedia = (() => ({ matches: reduced })) as never;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("offers an outline camera button that opens the photo picker", () => {
  render(<Box />);
  const button = screen.getByRole("button", { name: "Scan written answer" });
  expect(button).toHaveAttribute("data-variant", "outline");
  expect(button.querySelector('[data-icon="camera"]')).not.toBeNull();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(input).toHaveAttribute("capture", "environment");
  const click = vi.spyOn(input, "click");
  fireEvent.click(button);
  expect(click).toHaveBeenCalled();
});

it("fills an empty box at once under reduced motion, then shows the [?] hint", async () => {
  render(<Box />);
  await choose();
  expect(box().value).toBe(scanned.text);
  expect(writes).toEqual([scanned.text]);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Check any words marked [?].",
  );
});

it("types the answer out progressively", async () => {
  vi.useFakeTimers();
  reduced = false;
  render(<Box />);
  await choose();
  expect(screen.getByRole("status")).toHaveTextContent("Typing your answer…");
  expect(screen.getByRole("button", { name: /Scan/ })).toBeDisabled();
  await act(async () => vi.advanceTimersByTime(300));
  expect(box().value.length).toBeGreaterThan(0);
  expect(box().value.length).toBeLessThan(scanned.text.length);
  await act(async () => vi.advanceTimersByTime(2000));
  expect(box().value).toBe(scanned.text);
  expect(screen.getByRole("status")).toHaveTextContent("[?]");
});

it("finishes the text if unmounted mid-reveal", async () => {
  vi.useFakeTimers();
  reduced = false;
  const { unmount } = render(<Box />);
  await choose();
  await act(async () => vi.advanceTimersByTime(100));
  unmount();
  expect(writes.at(-1)).toBe(scanned.text);
});

it.each([
  ["Replace", scanned.text],
  ["Add below", `My first line\n\n${scanned.text}`],
  ["Cancel", "My first line"],
])("asks before changing a non-empty box: %s", async (choice, expected) => {
  render(<Box initial="My first line  " />);
  await choose();
  expect(box().value).toBe("My first line  ");
  expect(
    screen.getByRole("alertdialog", { name: /already has text/ }),
  ).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: choice }));
  });
  expect(box().value).toBe(choice === "Cancel" ? "My first line  " : expected);
  if (choice === "Cancel")
    expect(screen.getByRole("status")).not.toHaveTextContent("[?]");
});

it("leaves the box alone when the scan fails", async () => {
  hook.scan.mockResolvedValue(null);
  render(<Box initial="Keep me" />);
  await choose();
  expect(box().value).toBe("Keep me");
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("announces loading and errors accessibly", () => {
  Object.assign(hook, { state: "reading" });
  const { rerender } = render(<Box />);
  const button = screen.getByRole("button", { name: /Scan/ });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Reading your handwriting…",
  );
  Object.assign(hook, { state: "error", error: "Couldn't read your photo." });
  rerender(<Box />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't read your photo.",
  );
  expect(screen.getByRole("button", { name: /Scan/ })).toBeEnabled();
});

it("stays disabled until Retry-After passes", async () => {
  vi.useFakeTimers();
  hook.retryAt = Date.now() + 60_000;
  render(<Box />);
  expect(screen.getByRole("button", { name: /Scan/ })).toBeDisabled();
  await act(async () => vi.advanceTimersByTime(60_001));
  expect(screen.getByRole("button", { name: /Scan/ })).toBeEnabled();
});

it("respects the disabled prop", () => {
  render(<ScanToText attemptId="a1" value="" onText={() => {}} disabled />);
  expect(screen.getByRole("button", { name: /Scan/ })).toBeDisabled();
});

it("reports busy to the parent while scanning", () => {
  const onBusy = vi.fn();
  Object.assign(hook, { state: "reading" });
  const { rerender } = render(
    <ScanToText attemptId="a1" value="" onText={() => {}} onBusy={onBusy} />,
  );
  expect(onBusy).toHaveBeenLastCalledWith(true);
  Object.assign(hook, { state: "done" });
  rerender(
    <ScanToText attemptId="a1" value="" onText={() => {}} onBusy={onBusy} />,
  );
  expect(onBusy).toHaveBeenLastCalledWith(false);
});
