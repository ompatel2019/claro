import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  read: vi.fn(),
  assign: vi.fn(),
  open: vi.fn(),
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: mocks.read,
    }),
  }),
}));
import { FinishSprint } from "./finish-sprint";
beforeEach(() => {
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("location", { assign: mocks.assign });
  mocks.read.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it("disables repeated submissions and opens results after success", async () => {
  let resolve!: (value: unknown) => void;
  mocks.fetch.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(<FinishSprint id="s" />);
  const button = screen.getByRole("button");
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  resolve({ ok: true, json: async () => ({ finished: true }) });
  await waitFor(() =>
    expect(mocks.assign).toHaveBeenCalledWith("/student/sprint/s/results"),
  );
});
for (const status of [409, 500])
  it(`shows the actual ${status} server error and permits retry`, async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: "Answers changed while finishing" }),
    });
    render(<FinishSprint id="s" />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Answers changed while finishing",
    );
    expect(screen.getByRole("link", { name: "View results" })).toHaveAttribute(
      "href",
      "/student/sprint/s/results",
    );
    expect(screen.getByRole("button")).toBeEnabled();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
  });
it("handles a dropped connection and a failed recovery read", async () => {
  mocks.fetch.mockRejectedValue(new Error("Connection lost"));
  mocks.read.mockRejectedValue(new Error("Offline"));
  render(<FinishSprint id="s" />);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  expect(screen.getByRole("button")).toBeEnabled();
});
it("uses a fallback for a non-JSON failure", async () => {
  mocks.fetch.mockResolvedValue({
    ok: false,
    json: async () => {
      throw new Error("HTML");
    },
  });
  render(<FinishSprint id="s" />);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn’t finish. Try again.",
  );
});
for (const failure of ["http", "network"])
  it(`recovers a finished session after ${failure} failure`, async () => {
    if (failure === "http")
      mocks.fetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Timeout" }),
      });
    else mocks.fetch.mockRejectedValue(new Error("Connection lost"));
    mocks.read.mockResolvedValue({ data: { finished_at: "2026-10-19" } });
    render(<FinishSprint id="s" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith("/student/sprint/s/results"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "u" }) }));
vi.mock("./sprint-setup", () => ({ SprintSetup: () => null }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const chain = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        is() {
          return this;
        },
        order() {
          return table === "topics"
            ? Promise.resolve({ data: [], error: null })
            : this;
        },
        limit() {
          return this;
        },
        maybeSingle: mocks.open,
      };
      return chain;
    },
  }),
}));
for (const [statuses, label] of [
  [["pending"], "Continue"],
  [["marked", "marked"], "View results"],
  [[], "Continue"],
] as const)
  it(`setup recovery action for ${statuses.join(",") || "empty"} attempts`, async () => {
    mocks.open.mockResolvedValue({
      data: {
        id: "s",
        kind: "sprint",
        config: { mode: "mcq", timed: false },
        started_at: "2026-10-19T00:00:00Z",
        elapsed_s: 0,
        attempts: statuses.map((status) => ({
          status,
          choice_index: 0,
          answer_text: null,
          transcript: null,
        })),
      },
      error: null,
    });
    const { default: SprintPage } =
      await import("@/app/(app)/student/sprint/page");
    render(await SprintPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      `/student/sprint/s${label === "View results" ? "/results" : ""}`,
    );
  });
