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
it.each([
  [2, 2, 20, "Answer 1 more question", false],
  [3, 1, 20, "in another session", false],
  [3, 2, 20, null, true],
  [3, 2, 60, "No weak topics", false],
  [
    0,
    0,
    null,
    "Weak spots unlock after 3 marked answers across 2 sessions",
    false,
  ],
])(
  "home gates %s answers across %s sessions with score %s",
  async (answered, sessions, pct, copy, unlocked) => {
    mocks.requireProfile.mockResolvedValue({
      id: "synthetic-student",
      role: "student",
      year_level: 12,
    });
    mocks.progress.mockResolvedValue({
      topics: [
        {
          id: "synthetic-topic",
          parent_id: "synthetic-parent",
          name: "Synthetic topic",
          answered,
          sessions,
          pct,
        },
      ],
    });
    const page = await Home();
    // Resolve only the WeakTopics boundary; unrelated Home cards have independent reads.
    const side = page.props.children.at(-1).props.children[1].props.children;
    const boundary = side.at(-1);
    render(await resolve(boundary));
    expect(mocks.progress).toHaveBeenCalledWith(
      "all",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    if (copy) expect(screen.getByText(new RegExp(copy))).toBeInTheDocument();
    const link = screen.queryByRole("link", { name: "Practise" });
    if (unlocked)
      expect(link).toHaveAttribute(
        "href",
        "/student/sprint?topics=synthetic-parent&sub=synthetic-topic&history=prefer_new",
      );
    else expect(link).toBeNull();
  },
);
it("shows a retry when home history fails", async () => {
  mocks.requireProfile.mockResolvedValue({
    id: "synthetic-student",
    role: "student",
    year_level: 12,
  });
  mocks.progress.mockRejectedValue(new Error("Unavailable"));
  const page = await Home();
  const side = page.props.children.at(-1).props.children[1].props.children;
  render(await resolve(side.at(-1)));
  expect(screen.getByRole("alert")).toHaveTextContent("weak topics");
  expect(screen.queryByRole("link", { name: "Practise" })).toBeNull();
});
