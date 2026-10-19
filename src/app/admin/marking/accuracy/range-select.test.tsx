import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/marking/accuracy",
  useSearchParams: () => new URLSearchParams("tab=x"),
}));
import { RangeSelect } from "./range-select";

afterEach(cleanup);

it("shows the current range and writes the chosen one to the URL", () => {
  render(<RangeSelect range={30} />);
  expect(screen.getByRole("group", { name: "Date range" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "7 days" }));
  expect(push).toHaveBeenCalledWith("/admin/marking/accuracy?tab=x&range=7");
});
