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
it("uses the page range selector to refresh all range-scoped cards", async () => {
  render(<ProgressControls range="90" />);
  fireEvent.click(screen.getByRole("combobox", { name: "Progress range" }));
  const option = await screen.findByRole("option", { name: "This year" });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
  expect(mocks.replace).toHaveBeenCalledWith(
    "/student/progress?range=year&kind=sprint",
    { scroll: false },
  );
});
