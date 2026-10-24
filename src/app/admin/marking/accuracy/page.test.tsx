import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { computeAccuracy } from "./data";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  loadAccuracy: vi.fn(),
  loadLatestEval: vi.fn(),
  loadEvalRuns: vi.fn(),
  loadBucketRuns: vi.fn(),
  loadDocs: vi.fn(),
  loadComparison: vi.fn(),
  dialog: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("./data", async (original) => ({
  ...(await original<typeof import("./data")>()),
  loadAccuracy: mocks.loadAccuracy,
}));
vi.mock("./eval", () => ({
  loadLatestEval: mocks.loadLatestEval,
  loadEvalRuns: mocks.loadEvalRuns,
}));
vi.mock("../engine/store", () => ({ loadBucketRuns: mocks.loadBucketRuns }));
vi.mock("../engine/docs", () => ({ loadDocs: mocks.loadDocs }));
vi.mock("../engine/compare-data", () => ({
  loadComparison: mocks.loadComparison,
}));
vi.mock("../engine/actions", () => ({ evalRunDialogData: mocks.dialog }));
vi.mock("../engine/new-run", () => ({
  NewRun: () => <button type="button">New run</button>,
}));
vi.mock("../engine/compare-view", () => ({
  CompareView: () => <p>Compare view</p>,
}));
vi.mock("../engine/markdown", () => ({
  Markdown: ({ text }: { text: string }) => <p>{text}</p>,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/marking/accuracy",
  useSearchParams: () => new URLSearchParams(),
}));
import AccuracyPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ role: "admin" });
  mocks.loadAccuracy.mockResolvedValue(
    computeAccuracy([], [], [], 30, new Date("2026-10-09T03:00:00Z")),
  );
  mocks.loadLatestEval.mockResolvedValue(null);
  mocks.loadEvalRuns.mockResolvedValue([]);
  mocks.loadBucketRuns.mockResolvedValue([]);
  mocks.loadDocs.mockResolvedValue([]);
  mocks.loadComparison.mockResolvedValue(null);
  mocks.dialog.mockResolvedValue({});
});
afterEach(cleanup);
const page = async (range?: string, extra: Record<string, string> = {}) =>
  render(
    <TooltipProvider>
      {await AccuracyPage({
        searchParams: Promise.resolve({ range, ...extra }),
      })}
    </TooltipProvider>,
  );
const verifiedCard = () =>
  screen
    .getByText("Admin-verified accuracy")
    .closest<HTMLElement>('[data-component="StatCard"]')!;

it("shows the honest empty verified sample, independent of the eval empty state", async () => {
  await page();
  expect(
    within(verifiedCard()).getByText("No admin-verified answers yet"),
  ).toBeInTheDocument();
  expect(verifiedCard()).toHaveTextContent(
    "0 of 0 comparable staff-initiated written reviews",
  );
  expect(verifiedCard()).toHaveTextContent("Student disputes are excluded");
  expect(verifiedCard()).toHaveTextContent("not overall accuracy");
  expect(screen.getByText("No full offline eval yet")).toBeInTheDocument();
});

it("displays exact admin agreement and exclusion count, using the selected range", async () => {
  const empty = computeAccuracy(
    [],
    [],
    [],
    7,
    new Date("2026-10-09T03:00:00Z"),
  );
  mocks.loadAccuracy.mockResolvedValue({
    ...empty,
    verified: 4,
    verifiedAgreed: 3,
    excludedDisputes: 2,
  });
  await page("7");
  expect(mocks.requireAdmin).toHaveBeenCalledOnce();
  expect(mocks.loadAccuracy).toHaveBeenCalledWith(7);
  expect(within(verifiedCard()).getByText("75.0%")).toBeInTheDocument();
  expect(verifiedCard()).toHaveTextContent("3 of 4");
});

it("renders a true 0% for a nonempty sample with no exact matches", async () => {
  mocks.loadAccuracy.mockResolvedValue({
    ...computeAccuracy([], [], [], 30),
    verified: 2,
    verifiedAgreed: 0,
  });
  await page();
  expect(within(verifiedCard()).getByText("0.0%")).toBeInTheDocument();
});

it("merges accuracy into Marking quality with three tabs and no agreement cards", async () => {
  await page();
  expect(
    screen.getByRole("heading", { level: 1, name: "Marking quality" }),
  ).toBeInTheDocument();
  const tabs = screen.getByRole("navigation", { name: "Marking quality" });
  expect(
    within(tabs).getByRole("link", { name: "Live checks" }),
  ).toHaveAttribute("aria-current", "page");
  expect(within(tabs).getByRole("link", { name: "Eval runs" })).toHaveAttribute(
    "href",
    "/admin/marking/accuracy?tab=runs",
  );
  expect(
    within(tabs).getByRole("link", { name: "How marking works" }),
  ).toHaveAttribute("href", "/admin/marking/accuracy?tab=docs");
  expect(document.querySelectorAll('[data-component="StatCard"]')).toHaveLength(
    2,
  );
  expect(screen.queryByText("Settled by second pass")).not.toBeInTheDocument();
  expect(screen.queryByText("Sent to review")).not.toBeInTheDocument();
});

it("keeps the dispute footnote behind a help button", async () => {
  await page();
  expect(screen.queryByText(/disputes excluded/)).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "How disputes are counted" }),
  );
  expect(await screen.findByText(/0 disputes excluded/)).toHaveTextContent(
    "at least 3 resolved disputes",
  );
});

it("shows eval runs with one New run action, without loading live metrics", async () => {
  await page(undefined, { tab: "runs" });
  expect(mocks.dialog).toHaveBeenCalledOnce();
  expect(mocks.loadEvalRuns).toHaveBeenCalledOnce();
  expect(mocks.loadBucketRuns).toHaveBeenCalledOnce();
  expect(mocks.loadAccuracy).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "New run" })).toBeInTheDocument();
  expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
});

it("compares two runs on the eval runs tab", async () => {
  mocks.loadComparison.mockResolvedValue({ rows: [] });
  await page(undefined, { tab: "runs", a: "one", b: "two" });
  expect(mocks.loadComparison).toHaveBeenCalledWith("one", "two");
  expect(mocks.dialog).not.toHaveBeenCalled();
  expect(screen.getByText("Compare view")).toBeInTheDocument();
});

it("keeps every engine doc page reachable on How marking works", async () => {
  mocks.loadDocs.mockResolvedValue([
    { id: "ENGINE", text: "Engine doc" },
    { id: "AIRO-5-2", text: "Airo 5.2 doc" },
  ]);
  await page(undefined, { tab: "docs", doc: "AIRO-5-2" });
  const nav = screen.getByRole("navigation", { name: "Engine documents" });
  expect(within(nav).getByRole("link", { name: "AIRO-5-2" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(within(nav).getByRole("link", { name: "ENGINE" })).toHaveAttribute(
    "href",
    "/admin/marking/accuracy?tab=docs&doc=ENGINE",
  );
  expect(screen.getByText("Airo 5.2 doc")).toBeInTheDocument();
  expect(mocks.loadAccuracy).not.toHaveBeenCalled();
});

it("redirects an unknown tab to Live checks", async () => {
  await expect(page(undefined, { tab: "nope" })).rejects.toThrow(
    "redirect:/admin/marking/accuracy",
  );
});

it("does not load sensitive metrics when admin access fails", async () => {
  mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
  await expect(page()).rejects.toThrow("forbidden");
  expect(mocks.loadAccuracy).not.toHaveBeenCalled();
  expect(mocks.loadLatestEval).not.toHaveBeenCalled();
});
