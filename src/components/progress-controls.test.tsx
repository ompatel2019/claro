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
  const group = screen.getByRole("radiogroup", { name: "Progress range" });
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
  fireEvent.click(screen.getByRole("radio", { name: "90 days" }));
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(group, { key: "ArrowLeft" });
  expect(mocks.replace).toHaveBeenLastCalledWith(
    "/student/progress?range=30&kind=sprint",
    { scroll: false },
  );
});
