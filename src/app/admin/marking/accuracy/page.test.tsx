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
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("./data", async (original) => ({
  ...(await original<typeof import("./data")>()),
  loadAccuracy: mocks.loadAccuracy,
}));
vi.mock("./eval", () => ({ loadLatestEval: mocks.loadLatestEval }));
vi.mock("next/navigation", () => ({
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
});
afterEach(cleanup);
const page = async (range?: string) =>
  render(
    <TooltipProvider>
      {await AccuracyPage({ searchParams: Promise.resolve({ range }) })}
    </TooltipProvider>,
  );
const verifiedCard = () =>
  screen.getByText("Admin-verified accuracy").closest("dl")!;

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
  expect(screen.getByText(/2 disputes excluded/)).toHaveTextContent(
    "at least 3 resolved disputes",
  );
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

it("explains checker status and dispute influence on keyboard focus", async () => {
  await page();
  const trigger = screen.getByRole("button", { name: "About check agreement" });
  fireEvent.focus(trigger);
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "Agreed ÷ checked written answers",
  );
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "not human-verified accuracy",
  );
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "student disputes can change that status",
  );
});

it("does not load sensitive metrics when admin access fails", async () => {
  mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));
  await expect(page()).rejects.toThrow("forbidden");
  expect(mocks.loadAccuracy).not.toHaveBeenCalled();
  expect(mocks.loadLatestEval).not.toHaveBeenCalled();
});
