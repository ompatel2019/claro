import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadDashboard: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin-data", () => ({ loadDashboard: mocks.loadDashboard }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import AdminHome from "./page";

const data = {
  students: 1,
  active: { now: 0, prev: 0 },
  openReviews: { count: 0, oldestDays: null },
  spend: { month: 0, all: 0, cap: 100 },
  sessionsPerDay: [{ day: "2026-10-09", value: 0 }],
  spendPerDay: [{ day: "2026-10-09", value: 0 }],
  attention: {
    failed: 0,
    newFeedback: 0,
    contentReports: 0,
    importReview: 0,
    agreement: null,
  },
  latest: [],
};
async function dashboard() {
  const page = AdminHome();
  const content = page.props.children[1].props.children;
  return content.type();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ role: "admin" });
  mocks.loadDashboard.mockResolvedValue(data);
});
afterEach(cleanup);
const days = (values: number[]) =>
  values.map((value, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, "0")}`,
    value,
  }));
const card = (label: string) =>
  within(
    screen
      .getByText(label)
      .closest<HTMLElement>('[data-component="StatCard"]')!,
  );

it("shows four real numbers: active students, sessions, open reviews and month-to-date spend", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    active: { now: 12, prev: 9 },
    openReviews: { count: 4, oldestDays: 2 },
    spend: { month: 14.25, all: 81.5, cap: 100 },
    sessionsPerDay: days([
      ...Array(16).fill(9),
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      2,
      2,
      2,
      2,
      2,
    ]),
  });
  render(await dashboard());
  expect(card("Active students, 7 days").getByText("12")).toBeInTheDocument();
  expect(card("Active students, 7 days").getByText("+3")).toBeInTheDocument();
  expect(screen.getByText("vs 9 the week before")).toBeInTheDocument();
  expect(card("Sessions, 7 days").getByText("14")).toBeInTheDocument();
  expect(card("Sessions, 7 days").getByText("+7")).toBeInTheDocument();
  expect(screen.getByText("vs 7 the week before")).toBeInTheDocument();
  expect(card("Open reviews").getByText("4")).toBeInTheDocument();
  expect(screen.getByText("Oldest waiting 2 days")).toBeInTheDocument();
  const spend = card("Spend this month");
  expect(spend.getByRole("link", { name: "$14.25" })).toHaveAttribute(
    "href",
    "/admin/spend",
  );
  // The meter is month-to-date over the cap, not all-time.
  const meter = screen.getByRole("progressbar", {
    name: "Spend this month against the cap",
  });
  expect(meter).toHaveAttribute("aria-valuenow", "14");
  expect(meter).toHaveAttribute("aria-valuetext", "$14.25 of $100 (14%)");
  expect(
    spend.getByText("Month to date · $14.25 of $100 cap"),
  ).toBeInTheDocument();
});

it("drops the review queue card, the spend chart and the day pickers", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    sessionsPerDay: days(Array(30).fill(1)),
    spendPerDay: days(Array(30).fill(0.5)),
  });
  render(await dashboard());
  expect(screen.queryByText("Review queue")).toBeNull();
  expect(screen.queryByText(/AI spend, last 7 days/)).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByText("Day")).toBeNull();
  // One chart, the last 14 Sydney days of real sessions.
  const chart = screen.getByRole("img", {
    name: "Sessions per day, 14 Sydney days",
  });
  expect(chart.querySelectorAll("circle")).toHaveLength(14);
  expect(screen.getByText("14 sessions")).toBeInTheDocument();
});

it("orders the page: numbers, then Needs attention, then activity", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    latest: Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      user_id: "student",
      name: `Student ${i}`,
      kind: "single",
      mode: null,
      score: 2,
      max: 2,
      finished_at: "2026-10-19T00:00:00Z",
    })),
  });
  render(await dashboard());
  const before = (a: Element, b: Element) =>
    !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const kpi = screen.getByText("Open reviews");
  const attention = screen.getByRole("heading", { name: "Needs attention" });
  const chart = screen.getByRole("img", { name: /Sessions per day/ });
  const recent = screen.getByRole("heading", { name: "Recent sessions" });
  expect(before(kpi, attention)).toBe(true);
  expect(before(attention, chart)).toBe(true);
  expect(before(chart, recent)).toBe(true);
  const list = screen.getByRole("list", { name: "Recent sessions" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  expect(within(list).getAllByRole("link")[0]).toHaveAttribute(
    "href",
    "/admin/students/student?tab=sessions&session=s0",
  );
  expect(screen.getByRole("link", { name: "All students" })).toHaveAttribute(
    "href",
    "/admin/students",
  );
});

it.each([
  [3, 9, "−6"],
  [9, 9, "±0"],
])(
  "keeps the active-student comparison for %i vs %i",
  async (now, prev, delta) => {
    mocks.loadDashboard.mockResolvedValue({ ...data, active: { now, prev } });
    const { container } = render(await dashboard());
    expect(
      container.querySelector('[data-component="DeltaPill"]'),
    ).toHaveTextContent(delta === "±0" ? "0" : delta);
  },
);

it("handles an empty install and students with no finished sessions", async () => {
  mocks.loadDashboard.mockResolvedValue({ ...data, students: 0 });
  const view = render(await dashboard());
  expect(screen.getByText("No students yet")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "$0.00" })).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  view.unmount();
  mocks.loadDashboard.mockResolvedValue(data);
  render(await dashboard());
  expect(screen.getByText("No finished sessions yet")).toBeInTheDocument();
  expect(screen.getByText(/All clear/)).toBeInTheDocument();
  // Fewer than 14 days of history: no invented comparison.
  expect(screen.getByText("Sessions started")).toBeInTheDocument();
  // sessionsPerDay counts sessions by start date, so nothing claims "finished".
  expect(screen.getByText(/^Sessions started, last /)).toBeInTheDocument();
});

it("links each attention row to its page with a count chip", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    openReviews: { count: 4, oldestDays: 5 },
    spend: { month: 3, all: 82, cap: 100 },
    attention: {
      ...data.attention,
      importReview: 3,
      failed: 2,
      agreement: 84.99,
    },
  });
  render(await dashboard());
  expect(
    screen.getByRole("link", {
      name: /open mark reviews · oldest waiting 5 days/,
    }),
  ).toHaveAttribute("href", "/admin/marking/review?tab=open");
  expect(
    screen.getByRole("link", { name: /drafts in import review/ }),
  ).toHaveAttribute("href", "/admin/content/questions?status=review");
  expect(
    screen.getByRole("link", { name: /failed or unreadable/ }),
  ).toHaveAttribute("href", "/admin/marking/review?tab=failed");
  expect(
    screen.getByRole("link", { name: /check agreement/ }),
  ).toBeInTheDocument();
  // The cap warning stays on all-time spend, which is what the AI budget enforces.
  expect(
    screen.getByRole("link", { name: /all-time spend at 82% of the cap/ }),
  ).toHaveAttribute("href", "/admin/spend");
});

it("tests thresholds before rounding", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    spend: { month: 0, all: 79.99, cap: 100 },
    attention: { ...data.attention, agreement: 85 },
  });
  render(await dashboard());
  expect(screen.queryByRole("link", { name: /spend at/ })).toBeNull();
  expect(screen.queryByRole("link", { name: /check agreement/ })).toBeNull();
});

it("caps the meter while announcing month-to-date spend above the cap", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    spend: { month: 110, all: 110, cap: 100 },
  });
  render(await dashboard());
  const progress = screen.getByRole("progressbar");
  expect(progress).toHaveAttribute("aria-valuenow", "100");
  expect(progress).toHaveAttribute("aria-valuetext", "$110.00 of $100 (100%)");
});

it("retains each card's title and retry action when loading fails", async () => {
  mocks.loadDashboard.mockRejectedValue(new Error("Unavailable"));
  render(await dashboard());
  expect(screen.getAllByRole("alert")).toHaveLength(7);
  expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(7);
  expect(
    screen.getByRole("heading", { name: "Needs attention" }),
  ).toBeInTheDocument();
});

it("does not swallow an authorisation redirect", async () => {
  mocks.requireAdmin.mockRejectedValue(new Error("redirect:/student"));
  await expect(dashboard()).rejects.toThrow("redirect:/student");
  expect(mocks.loadDashboard).not.toHaveBeenCalled();
});
