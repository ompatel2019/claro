import { beforeEach, expect, it, vi } from "vitest";
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
  mocks.progress.mockResolvedValue(null);
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
  expect(mocks.select).not.toHaveBeenCalledWith("id", {
    count: "exact",
    head: true,
  });
});

it("does not treat a failed session lookup as a first visit", async () => {
  mocks.eq.mockResolvedValue({
    count: null,
    error: { message: "Unavailable" },
  });
  await expect(Home()).rejects.toThrow("Couldn't check first visit.");
});

it("starts the activity read without querying dashboard progress or due cards", async () => {
  mocks.requireProfile.mockResolvedValue({
    id: "own-student",
    role: "student",
    year_level: 11,
  });
  const rpc = vi.fn().mockRejectedValue(new Error("Activity unavailable"));
  mocks.createClient.mockResolvedValue({ from: mocks.from, rpc });
  await Home();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(rpc).toHaveBeenCalledWith("activity_days", expect.any(Object));
  expect(mocks.from).not.toHaveBeenCalledWith("flashcard_progress");
  expect(mocks.progress).not.toHaveBeenCalled();
});
