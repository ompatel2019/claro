import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { buildPerformance } from "./performance";
import { PerformanceView } from "./performance-view";
it("renders two benchmark tables, recorded figures, sources and dashes for missing measurements", () => {
  render(
    <PerformanceView
      heldout={buildPerformance([], "heldout-196")}
      a1={buildPerformance([], "a1-18")}
    />,
  );
  const heldout = screen.getByRole("table", {
    name: "heldout-196 performance",
  });
  const a1 = screen.getByRole("table", { name: "a1-18 performance" });
  expect(
    within(a1).getByRole("columnheader", { name: "Same-question examples" }),
  ).toBeInTheDocument();
  const rows = within(heldout).getAllByRole("row");
  const missing = rows.find((row) => within(row).queryByText("4.1"))!;
  expect(within(missing).getAllByText("—")).toHaveLength(6);
  const recorded = rows.find((row) => within(row).queryByText("3.0"))!;
  expect(within(recorded).getByText("45.9%")).toHaveAttribute(
    "title",
    expect.stringContaining("1211"),
  );
  expect(within(recorded).getByText("$0.0274")).toBeInTheDocument();
  expect(within(recorded).getByText("On")).toBeInTheDocument();
});
