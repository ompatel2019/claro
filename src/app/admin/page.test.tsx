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
  sessionsWeek: 0,
  openReviews: { count: 0, oldestDays: null },
  spend: { month: 0, all: 0, cap: 100 },
  sessionsTotal: 0,
  spendTotal: 0,
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
it("keeps A1's dashboard KPIs and both daily charts with their SQL totals", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    active: { now: 12, prev: 9 },
    sessionsWeek: 27,
    openReviews: { count: 4, oldestDays: 2 },
    spend: { month: 14.25, all: 81.5, cap: 100 },
    sessionsTotal: 63,
    spendTotal: 19.75,
    sessionsPerDay: [{ day: "2026-10-09", value: 3 }],
    spendPerDay: [{ day: "2026-10-09", value: 1.25 }],
  });
  render(await dashboard());
  for (const [label, value] of [
    ["Active students, 7 days", "12"],
    ["Sessions, 7 days", "27"],
    ["Open reviews", "4"],
    ["Spend this month", "$14.25 of $100"],
  ]) {
    const card = within(screen.getByText(label).closest("dl")!);
    expect(card.getByText(value, { exact: true })).toBeInTheDocument();
  }
  expect(screen.getByText("+3")).toBeInTheDocument();
  expect(screen.getByText("vs 9 previous 7")).toBeInTheDocument();
  expect(screen.getByText("oldest 2 days")).toBeInTheDocument();
  expect(screen.getByText("63 sessions")).toBeInTheDocument();
  expect(screen.getByText("$19.75")).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "Sessions per day, last 30 days" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "AI spend per day, last 30 days" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("status").map((s) => s.textContent)).toEqual([
    "3",
    "$1.25",
  ]);
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "$81.50 of $100 (82%)",
  );
  expect(screen.getByRole("link", { name: /spend at 82%/ })).toHaveAttribute(
    "href",
    "/admin/spend",
  );
});
it.each([
  [3, 9, "−6"],
  [9, 9, "±0"],
])(
  "keeps the active-student comparison for %i vs %i",
  async (now, prev, delta) => {
    mocks.loadDashboard.mockResolvedValue({ ...data, active: { now, prev } });
    render(await dashboard());
    expect(screen.getByText(delta)).toBeInTheDocument();
  },
);
it("retains zero spend and both charts on an empty install", async () => {
  mocks.loadDashboard.mockResolvedValue({ ...data, students: 0 });
  render(await dashboard());
  expect(screen.getByText("$0.00 of $100")).toBeInTheDocument();
  expect(screen.getByText("0 sessions")).toBeInTheDocument();
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  expect(screen.getAllByRole("status").map((s) => s.textContent)).toEqual([
    "0",
    "$0.00",
  ]);
});
it("uses a real attention heading and handles students with no finished sessions", async () => {
  render(await dashboard());
  expect(
    screen.getByRole("heading", { name: "Needs attention", level: 2 }),
  ).toBeInTheDocument();
  expect(screen.getByText("No finished sessions yet")).toBeInTheDocument();
  expect(screen.getByText(/All clear/)).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it("shows the empty-install state", async () => {
  mocks.loadDashboard.mockResolvedValue({ ...data, students: 0 });
  render(await dashboard());
  expect(screen.getByText("No students yet")).toBeInTheDocument();
});
it("opens the import review status from the attention list", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    attention: { ...data.attention, importReview: 3 },
  });
  render(await dashboard());
  expect(
    screen.getByRole("link", { name: /drafts in import review/ }),
  ).toHaveAttribute("href", "/admin/content/questions?status=review");
});
it("links failures to the failed queue and tests thresholds before rounding", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    spend: { month: 0, all: 79.99, cap: 100 },
    attention: { ...data.attention, failed: 2, agreement: 84.99 },
  });
  render(await dashboard());
  expect(
    screen.getByRole("link", { name: /failed or unreadable/ }),
  ).toHaveAttribute("href", "/admin/marking/review?tab=failed");
  expect(
    screen.getByRole("link", { name: /check agreement/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /spend at/ }),
  ).not.toBeInTheDocument();
});
it("caps progress geometry while announcing actual spend above the cap", async () => {
  mocks.loadDashboard.mockResolvedValue({
    ...data,
    spend: { month: 0, all: 110, cap: 100 },
  });
  render(await dashboard());
  const progress = screen.getByRole("progressbar");
  expect(progress).toHaveAttribute("aria-valuenow", "100");
  expect(progress).toHaveAttribute("aria-valuetext", "$110.00 of $100 (110%)");
});
it("retains each card's title and retry action when loading fails", async () => {
  mocks.loadDashboard.mockRejectedValue(new Error("Unavailable"));
  render(await dashboard());
  expect(screen.getAllByRole("alert")).toHaveLength(8);
  expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(8);
  expect(
    screen.getByRole("heading", { name: "Needs attention" }),
  ).toBeInTheDocument();
});
it("does not swallow an authorisation redirect", async () => {
  mocks.requireAdmin.mockRejectedValue(new Error("redirect:/student"));
  await expect(dashboard()).rejects.toThrow("redirect:/student");
  expect(mocks.loadDashboard).not.toHaveBeenCalled();
});
