import { cleanup, render, screen } from "@testing-library/react";
import { resolve } from "@/test/resolve-server-components";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Children, type ReactElement } from "react";

const mocks = vi.hoisted(() => ({
  requireProfile: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  progress: vi.fn(),
}));
vi.mock("@/components/welcome-dialog", () => ({ WelcomeDialog: () => null }));
vi.mock("@/components/shortcut", () => ({ Shortcut: () => null }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({ requireProfile: mocks.requireProfile }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/progress-data", () => ({ loadProgress: mocks.progress }));
import Home from "./page";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { Shortcut } from "@/components/shortcut";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireProfile.mockResolvedValue({
    id: "own-student",
    role: "student",
    year_level: null,
    full_name: "Student",
    school: null,
  });
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  mocks.from.mockReturnValue({ in: mocks.in, select: mocks.select });
  mocks.in.mockReturnValue({ eq: mocks.eq });
  mocks.select.mockReturnValue({ in: mocks.in, eq: mocks.eq });
});

it.each([0, 1, 50, null])(
  "checks only own sessions and welcomes only at zero (%s)",
  async (count) => {
    mocks.eq.mockResolvedValue({ count, error: null });
    const page = await Home();
    const children = Children.toArray(page.props.children) as ReactElement[];
    expect(mocks.from).toHaveBeenCalledWith("sessions");
    expect(mocks.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "own-student");
    expect(children.some((child) => child.type === WelcomeDialog)).toBe(
      count === 0,
    );
    expect(children.some((child) => child.type === Shortcut)).toBe(count !== 0);
  },
);

it.each([
  { role: "admin", year_level: null },
  { role: "student", year_level: 11 },
])("skips the session query for %o", async (profile) => {
  mocks.requireProfile.mockResolvedValue({ id: "own-user", ...profile });
  await Home();
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("does not treat a failed session lookup as a first visit", async () => {
  mocks.eq.mockResolvedValue({
    count: null,
    error: { message: "Unavailable" },
  });
  await expect(Home()).rejects.toThrow("Couldn't check first visit.");
});

afterEach(cleanup);
it("renders four launch links, due count, streak and only the latest resume", async () => {
  mocks.requireProfile.mockResolvedValue({
    id: "synthetic-student",
    role: "student",
    year_level: 12,
  });
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "in", "is", "order", "lte"])
    query[method] = vi.fn(() => query);
  query.limit = vi.fn().mockResolvedValue({
    data: [
      {
        id: "resume",
        kind: "single",
        config: {},
        started_at: "2026-10-19T00:00:00Z",
        elapsed_s: 0,
        attempts: [],
        flashcard_reviews: [],
      },
    ],
    error: null,
  });
  query.then = vi.fn((done) =>
    Promise.resolve(done({ data: [], count: 7, error: null })),
  );
  mocks.createClient.mockResolvedValue({
    from: () => query,
    rpc: () => ({
      single: async () => ({
        data: { current_streak: 3, longest_streak: 8 },
        error: null,
      }),
    }),
  });
  render(await resolve(await Home()));
  for (const [name, href] of [
    ["Topic Sprint", "/student/sprint"],
    ["Flashcards", "/student/flashcards"],
    ["Mark my answer", "/student/mark"],
    ["Activity", "/student/activity"],
  ]) {
    expect(
      screen.getByRole("link", { name: new RegExp(`^${name}`) }),
    ).toHaveAttribute("href", href);
  }
  expect(screen.getByText("7 due")).toBeVisible();
  expect(screen.getByText("3 days")).toBeVisible();
  expect(screen.getByText("Longest 8 days")).toBeVisible();
  expect(screen.getByRole("link", { name: /^Continue$/ })).toHaveAttribute(
    "href",
    "/student/activity/resume",
  );
  expect(query.limit).toHaveBeenCalledWith(1);
  expect(mocks.progress).not.toHaveBeenCalled();
  expect(screen.queryByText("Score trend")).toBeNull();
  expect(
    screen.getByRole("link", { name: "View progress and weak topics" }),
  ).toHaveAttribute("href", "/student/progress");
});
it("keeps launch tiles usable when due, streak and resume reads fail", async () => {
  mocks.requireProfile.mockResolvedValue({
    id: "synthetic-student",
    role: "student",
    year_level: 12,
  });
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "in", "is", "order", "lte"])
    query[method] = vi.fn(() => query);
  query.limit = vi.fn().mockResolvedValue({ data: null, error: {} });
  query.then = vi.fn((done) =>
    Promise.resolve(done({ count: null, error: {} })),
  );
  mocks.createClient.mockResolvedValue({
    from: () => query,
    rpc: () => ({ single: async () => ({ data: null, error: {} }) }),
  });
  render(await resolve(await Home()));
  expect(
    screen.getByRole("link", { name: /Flashcards Choose a deck/ }),
  ).toHaveAttribute("href", "/student/flashcards");
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect(screen.queryByText("0 days")).toBeNull();
});
