import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/admin-data", () => ({ loadSpend: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/spend",
  useSearchParams: () => new URLSearchParams(),
}));
import { loadSpend } from "@/lib/admin-data";
import { computeSpend, type Range } from "./data";
import SpendPage from "./page";
import Loading from "./loading";
import ErrorPage from "./error";

const now = new Date("2026-10-08T23:00:00Z");
function spend(range: Range = "month") {
  return {
    ...computeSpend({ month: 0, all: 0 }, [], [], [], range, now),
    cap: 100,
    markers: [80, 90, 100],
    limits: {
      perMinute: 20,
      perHour: 200,
      markMyAnswerPerDay: 20,
      openDisputesPerAnswer: 1,
      openDisputesPerStudent: 3,
    },
  };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("renders KPIs and mark-value bands, labelled budget markers, empty sections and loader limits", async () => {
  vi.mocked(loadSpend).mockResolvedValue(spend());
  const { container } = render(
    await SpendPage({ searchParams: Promise.resolve({}) }),
  );
  expect(loadSpend).toHaveBeenCalledWith("month");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "AI spend",
  );
  expect(
    screen.getByText(
      "1 Oct 2026 to 9 Oct 2026 (Sydney, through now) · 0 OpenRouter calls",
    ),
  ).toBeInTheDocument();
  expect(
    container.querySelectorAll('[data-component="StatCard"]'),
  ).toHaveLength(3);
  expect(screen.getByText("$0.00 of $100")).toBeInTheDocument();
  const perAnswer = screen.getByRole("table", {
    name: "Cost per marked answer",
  });
  expect(within(perAnswer).getAllByRole("row")).toHaveLength(7);
  expect(within(perAnswer).getAllByText("—")).toHaveLength(6);
  // One merged empty card, not one box per section.
  expect(container.querySelectorAll('[data-slot="empty"]')).toHaveLength(1);
  for (const text of [
    "0 calls · Sydney day",
    "0 calls · Sydney calendar month",
    "80% · Evals blocked",
    "90% · All AI stops",
    "100% · Cap",
    "No spend in this range",
    "Daily spend and the model, task, student breakdowns appear after an AI call.",
    "No one right now",
    "20/min and 200/hour",
    "Admins exempt",
    "20/day per student (Sydney)",
    "1 open per answer, 3 open per student",
  ])
    expect(screen.getByText(text, { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  expect(container.querySelector(".panel, .font-serif")).toBeNull();
});
it("shows stacked spend, calls, written average and over-limit student links, clamping the progress bar", async () => {
  const data = spend("30");
  data.all = 120;
  data.byMarkValue[2] = {
    label: "4 marks",
    answers: 2,
    trackedAnswers: 1,
    usd: 0.0025,
    average: 0.0025,
  };
  data.byModel = [
    {
      model: "Alpha",
      calls: 2,
      input_tokens: 100,
      cached_tokens: 20,
      output_tokens: 10,
      usd: 1,
    },
  ];
  data.perDay = [{ day: "2026-10-09", usd: 1, models: { Alpha: 1 } }];
  data.over150 = [{ id: "Student A", name: "Student A", calls: 151 }];
  data.calls = 2;
  vi.mocked(loadSpend).mockResolvedValue(data);
  render(await SpendPage({ searchParams: Promise.resolve({ range: "30" }) }));
  expect(loadSpend).toHaveBeenCalledWith("30");
  expect(
    screen.getByText(/\(Sydney, through now\) · 2 OpenRouter calls$/),
  ).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  expect(screen.getByText("$0.003")).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Spend per day, Sydney dates, stacked by model",
  );
  const over = screen.getByRole("list", { name: "Students over 150 calls" });
  expect(within(over).getByRole("link", { name: "Student A" })).toHaveAttribute(
    "href",
    "/admin/students/Student%20A",
  );
  expect(over).toHaveTextContent("151 calls");
});
it("labels the spend chart as OpenRouter only", async () => {
  const data = spend();
  data.perDay = [
    { day: "2026-10-09", usd: 2.5, models: { "anthropic/model-a": 2.5 } },
  ];
  vi.mocked(loadSpend).mockResolvedValue(data);
  render(await SpendPage({ searchParams: Promise.resolve({}) }));
  const chart = screen
    .getByRole("img", { name: "Spend per day, Sydney dates, stacked by model" })
    .closest('[data-slot="card"]')!;
  expect(
    within(chart as HTMLElement).getByText("OpenRouter only"),
  ).toBeInTheDocument();
  expect(screen.queryByText("No spend in this range")).toBeNull();
});
it("reflects historical inclusive custom dates and defaults invalid ranges", async () => {
  const range = { from: "2026-09-01", to: "2026-09-30" };
  vi.mocked(loadSpend).mockResolvedValue(spend(range));
  render(
    await SpendPage({
      searchParams: Promise.resolve({ range: "custom", ...range }),
    }),
  );
  expect(loadSpend).toHaveBeenCalledWith(range);
  expect(
    screen.getByText(
      "1 Sept 2026 to 30 Sept 2026 (Sydney, inclusive) · 0 OpenRouter calls",
    ),
  ).toBeInTheDocument();
  cleanup();
  vi.mocked(loadSpend).mockResolvedValue(spend());
  render(
    await SpendPage({ searchParams: Promise.resolve({ range: "invalid" }) }),
  );
  expect(loadSpend).toHaveBeenLastCalledWith("month");
  expect(screen.getByRole("combobox")).toHaveTextContent("This month");
});
it("lets loader failures reach the retry boundary and supplies loading skeletons", async () => {
  vi.mocked(loadSpend).mockRejectedValue(new Error("Unavailable"));
  await expect(
    SpendPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("Unavailable");
  const retry = vi.fn();
  render(<ErrorPage unstable_retry={retry} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't load this. Try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
  cleanup();
  const { container } = render(<Loading />);
  expect(screen.getByRole("status")).toHaveAccessibleName("Loading AI spend");
  expect(
    container.querySelectorAll('[data-slot="skeleton"]').length,
  ).toBeGreaterThan(10);
});

it("resets locally selected Custom when rejected dates resolve back to month", async () => {
  vi.mocked(loadSpend).mockResolvedValue(spend());
  const { rerender } = render(
    await SpendPage({ searchParams: Promise.resolve({}) }),
  );
  fireEvent.click(screen.getByRole("combobox"));
  const option = await screen.findByRole("option", { name: "Custom" });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
  expect(screen.getByLabelText("From")).toBeInTheDocument();
  rerender(
    await SpendPage({
      searchParams: Promise.resolve({
        range: "custom",
        from: "2019-12-31",
        to: "2026-10-09",
      }),
    }),
  );
  expect(loadSpend).toHaveBeenLastCalledWith("month");
  expect(screen.getByRole("combobox")).toHaveTextContent("This month");
  expect(screen.queryByLabelText("From")).toBeNull();
  expect(
    screen.getByText(/Those dates aren't valid, showing this month/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Sydney, through now/)).toHaveAttribute(
    "data-range",
    "month",
  );
});
