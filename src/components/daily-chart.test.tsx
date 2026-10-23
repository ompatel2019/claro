import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DailyChart } from "./daily-chart";

afterEach(cleanup);
it.each(["area", "bars"] as const)(
  "keeps all 30 Sydney days readable in the dashboard %s chart",
  async (kind) => {
    const title = kind === "bars" ? "AI spend per day" : "Sessions per day";
    const points = Array.from({ length: 30 }, (_, i) => ({
      day: `2026-09-${String(i + 1).padStart(2, "0")}`,
      value: kind === "bars" ? i / 100 : i,
    }));
    const { container } = render(
      <DailyChart title={title} hero="Total" kind={kind} points={points} />,
    );
    const select = screen.getByRole("combobox", { name: `${title} day` });
    expect(select).toHaveTextContent("30 Sept 2026");
    fireEvent.click(select);
    expect(await screen.findAllByRole("option")).toHaveLength(30);
    expect(screen.getByRole("status")).toHaveTextContent(
      kind === "bars" ? "$0.29" : "29",
    );
    const first = screen.getByRole("option", {
      name: "1 Sept 2026",
    });
    fireEvent.pointerDown(first);
    fireEvent.click(first);
    expect(screen.getByRole("status")).toHaveTextContent(
      kind === "bars" ? "$0.00" : "0",
    );
    const marks = container.querySelectorAll(
      kind === "bars" ? "rect" : "circle",
    );
    expect(marks).toHaveLength(30);
    fireEvent.click(marks[14].parentElement!);
    expect(select).toHaveTextContent("15 Sept 2026");
    expect(screen.getByRole("status")).toHaveTextContent(
      kind === "bars" ? "$0.14" : "14",
    );
    expect(marks[14].parentElement!.querySelector("title")).toHaveTextContent(
      "15 Sept 2026 (Sydney)",
    );
  },
);
it("shows an optional description under the title", () => {
  const points = [{ day: "2026-10-01", value: 1 }];
  const { rerender } = render(
    <DailyChart title="Spend" hero="$1.00" kind="bars" points={points} />,
  );
  expect(document.querySelector('[data-slot="card-description"]')).toBeNull();
  rerender(
    <DailyChart
      title="Spend"
      description="OpenRouter only"
      hero="$1.00"
      kind="bars"
      points={points}
    />,
  );
  expect(screen.getByText("OpenRouter only")).toHaveAttribute(
    "data-slot",
    "card-description",
  );
});
it("draws finite, zero-height spend bars when every day has zero usage", () => {
  const { container } = render(
    <DailyChart
      title="AI spend per day"
      hero="$0.00"
      kind="bars"
      points={[
        { day: "2026-10-01", value: 0 },
        { day: "2026-10-02", value: 0 },
      ]}
    />,
  );
  for (const bar of container.querySelectorAll("rect")) {
    expect(Number(bar.getAttribute("y"))).toBe(192);
    expect(Number(bar.getAttribute("height"))).toBe(0);
  }
  expect(screen.getByRole("status")).toHaveTextContent("$0.00");
});
it.each(["area", "bars"] as const)(
  "keeps an empty %s chart visible without a misleading day value",
  (kind) => {
    render(<DailyChart title="Daily total" hero="0" kind={kind} points={[]} />);
    expect(
      screen.getByRole("heading", { name: "Daily total" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  },
);
it("stacks model spend with a text legend, Sydney titles and a keyboard day control", async () => {
  const { container } = render(
    <DailyChart
      title="Spend per day"
      hero="$3.00"
      kind="bars"
      points={[
        { day: "2026-10-01", value: 3, models: { Alpha: 1, Beta: 2 } },
        { day: "2026-10-02", value: 0, models: {} },
      ]}
    />,
  );
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Spend per day, Sydney dates, stacked by model",
  );
  expect(screen.getByRole("list", { name: "Models" })).toHaveTextContent(
    "AlphaBeta",
  );
  const bars = container.querySelectorAll("rect");
  expect(bars).toHaveLength(4);
  expect(bars[0].querySelector("title")).toHaveTextContent(
    "1 Oct 2026 (Sydney) · Alpha: $1.00",
  );
  // Stacked segments touch and together reach the day's total.
  expect(
    Number(bars[1].getAttribute("y")) + Number(bars[1].getAttribute("height")),
  ).toBeCloseTo(Number(bars[0].getAttribute("y")));
  fireEvent.click(screen.getByRole("combobox", { name: "Spend per day day" }));
  const first = await screen.findByRole("option", {
    name: "1 Oct 2026",
  });
  fireEvent.pointerDown(first);
  fireEvent.click(first);
  expect(screen.getByRole("status")).toHaveTextContent(
    "$3.00Alpha: $1.00Beta: $2.00",
  );
  fireEvent.mouseEnter(bars[2].parentElement!);
  expect(screen.getByRole("status")).toHaveTextContent(
    "$0.00Alpha: $0.00Beta: $0.00",
  );
});
it("keeps dashboard area and unstacked spend charts working", () => {
  const { container } = render(
    <DailyChart
      title="Sessions per day"
      hero="3"
      kind="area"
      points={[
        { day: "2026-10-01", value: 1 },
        { day: "2026-10-02", value: 2 },
      ]}
    />,
  );
  expect(container.querySelectorAll('svg[role="img"] path')).toHaveLength(2);
  expect(
    container.querySelector('svg[role="img"] path[fill="none"]'),
  ).toHaveAttribute("d", expect.stringContaining("C"));
  expect(screen.queryByRole("list")).toBeNull();
  cleanup();
  render(
    <DailyChart
      title="AI spend per day"
      hero="$1.00"
      kind="bars"
      points={[{ day: "2026-10-01", value: 1 }]}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("$1.00");
});

it("offers the template table twin without changing chart data", () => {
  render(
    <DailyChart
      title="Sessions per day"
      hero="3"
      kind="area"
      points={[
        { day: "2026-10-01", value: 1 },
        { day: "2026-10-02", value: 2 },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
  const table = screen.getByRole("table", {
    name: "Sessions per day data",
  });
  expect(table).toHaveTextContent("1 Oct 2026");
  expect(table).toHaveTextContent("2");
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show as chart" }));
  expect(screen.getByRole("img")).toBeInTheDocument();
});
