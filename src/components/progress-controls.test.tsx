import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  query: "range=90&kind=sprint",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/student/progress",
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
import { ProgressControls } from "./progress-controls";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = "range=90&kind=sprint";
});
afterEach(cleanup);
it("uses the segmented range switcher to refresh all range-scoped cards", () => {
  render(<ProgressControls range="90" />);
  expect(
    screen
      .getAllByRole("radio")
      .map((r) => [r.textContent, r.getAttribute("aria-checked")]),
  ).toEqual([
    ["7 days", "false"],
    ["30 days", "false"],
    ["90 days", "true"],
    ["This year", "false"],
    ["All time", "false"],
  ]);
  fireEvent.click(screen.getByRole("radio", { name: "This year" }));
  expect(mocks.replace).toHaveBeenLastCalledWith(
    "/student/progress?range=year&kind=sprint",
    { scroll: false },
  );
  cleanup();
  mocks.replace.mockClear();
  render(<ProgressControls range="90" />);
  fireEvent.click(screen.getByRole("radio", { name: "90 days" }));
  expect(mocks.replace).not.toHaveBeenCalled();
  // While the page is still loading, each key moves on from the last choice.
  const radios = screen.getByRole("radiogroup", { name: "Progress range" });
  screen.getByRole("radio", { name: "90 days" }).focus();
  fireEvent.keyDown(radios, { key: "ArrowLeft" });
  fireEvent.keyDown(radios, { key: "ArrowLeft" });
  expect(screen.getByRole("radio", { name: "7 days" })).toHaveFocus();
  expect(mocks.replace.mock.calls.map((c) => c[0])).toEqual([
    "/student/progress?range=30&kind=sprint",
    "/student/progress?range=7&kind=sprint",
  ]);
});
