import { render, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { resolve } from "@/test/resolve-server-components";
import {
  parseActivityFilters,
  type ActivityData,
} from "@/lib/activity-filters";
import { sessionLabels } from "@/lib/session-summary";
import Activity from "./page";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  browser: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "student" }),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/flashcards", () => ({ sydneyToday: () => "2026-10-09" }));
vi.mock("@/components/activity-browser", () => ({
  ActivityBrowser: mocks.browser,
}));
const topics = [{ id: "t", parent_id: null, name: "Trade", sort: 1 }];
const row = {
  id: "s",
  kind: "sprint",
  paper_id: null,
  title: "RPC title",
  status: "Finished" as const,
  provisional: false,
  study: false,
  pct: 33.3,
  items: 2,
  answered: 1,
  elapsed_s: 10,
  started_at: "2026-10-08T01:00:00+00:00",
  finished_at: "2026-10-08T02:00:00+00:00",
};
const data: ActivityData = {
  rows: [row],
  total: 21,
  all_total: 25,
  page: 2,
  kind_total: 23,
  kinds: { sprint: 20, single: 2, flashcards: 1 },
  stats: { sessions: 21, questions: 30, average: 33.3, best: 80 },
};
const detail = {
  ...row,
  config: { mode: "short", topics: ["t"] },
  flashcard_reviews: [],
};
function responses(
  overrides: Record<string, unknown> = {},
  details = [detail],
) {
  const results = [
    { count: 25, error: null, ...overrides },
    { data: topics, error: null },
    { data: details, error: null },
    { data: [], error: null },
  ];
  mocks.from.mockImplementation(() => {
    const result = results.shift();
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      in() {
        return this;
      },
      is() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      then: (done: (value: unknown) => unknown) =>
        Promise.resolve(result).then(done),
    };
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.browser.mockReturnValue(null);
  mocks.rpc.mockResolvedValue({ data, error: null });
  responses();
});
afterEach(cleanup);

it.each(["newest", "oldest", "highest", "lowest"])(
  "pins the Activity loader props and labels for %s sorting",
  async (sort) => {
    const params = {
      sort,
      page: "2",
      topic: "t",
      status: "finished",
      q: " sprint ",
      date: "2026-10-04",
    };
    render(
      await resolve(await Activity({ searchParams: Promise.resolve(params) })),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("activity_stats", {
      p_filters: parseActivityFilters(params, "2026-10-09"),
      p_labels: sessionLabels,
    });
    expect(mocks.browser.mock.calls[0][0]).toEqual({
      filters: parseActivityFilters(params, "2026-10-09"),
      data: {
        ...data,
        rows: [{ ...row, title: "Short answer sprint · Trade" }],
      },
      details: { s: detail },
      topics,
      today: "2026-10-09",
    });
  },
);
it.each(["sprint", "single", "flashcards"])(
  "keeps %s filters and counts",
  async (kind) => {
    const kindRow = { ...row, kind };
    const kindDetail = { ...detail, kind };
    responses({}, [kindDetail]);
    mocks.rpc.mockResolvedValue({
      data: { ...data, rows: [kindRow] },
      error: null,
    });
    render(
      await resolve(
        await Activity({
          searchParams: Promise.resolve({ kind, page: "999" }),
        }),
      ),
    );
    expect(mocks.rpc.mock.calls[0][1].p_filters).toMatchObject({
      kind,
      page: 999,
    });
    const title =
      kind === "single"
        ? "Mark my answer · Trade"
        : kind === "flashcards"
          ? "Flashcards · Study · Trade"
          : "Short answer sprint · Trade";
    expect(mocks.browser.mock.calls[0][0].data).toEqual({
      ...data,
      rows: [{ ...kindRow, title }],
    });
  },
);
it("keeps null scores, empty pages and empty kind counts", async () => {
  const empty: ActivityData = {
    rows: [],
    total: 0,
    all_total: 25,
    page: 1,
    kind_total: 0,
    kinds: {},
    stats: { sessions: 0, questions: 0, average: null, best: null },
  };
  mocks.rpc.mockResolvedValue({ data: empty, error: null });
  render(
    await resolve(
      await Activity({ searchParams: Promise.resolve({ q: "missing" }) }),
    ),
  );
  expect(mocks.browser.mock.calls[0][0].data).toEqual(empty);
});
it.each([
  { scores: [1e308, 1e308], average: Infinity, best: 1e308 },
  { scores: [-1e308, -1e308], average: -Infinity, best: -1e308 },
  { scores: ["NaN", 50], average: NaN, best: NaN },
  { scores: ["Infinity"], average: NaN, best: Infinity },
  { scores: ["-Infinity"], average: NaN, best: -Infinity },
  { scores: ["Infinity", "-Infinity"], average: NaN, best: Infinity },
  { scores: [1e308, 1e308, -1e308], average: Infinity, best: 1e308 },
  { scores: [1e308, -1e308, 1e308], average: 1e308 / 3, best: 1e308 },
  { scores: [Infinity, -Infinity], average: NaN, best: Infinity },
])(
  "preserves old adapter arithmetic for exceptional scores $scores",
  async ({ scores, average, best }) => {
    mocks.rpc.mockResolvedValue({
      data: {
        ...data,
        score_values: scores,
        stats: { ...data.stats, average: null, best: null },
      },
      error: null,
    });
    render(
      await resolve(await Activity({ searchParams: Promise.resolve({}) })),
    );
    const actual = mocks.browser.mock.calls[0][0].data;
    expect(actual.stats).toEqual({ ...data.stats, average, best });
    expect(actual).not.toHaveProperty("score_values");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  },
);
it.each(["NaN", "Infinity", "-Infinity"])(
  "preserves the old RPC's %s string when the adapter did not recalculate",
  async (score) => {
    mocks.rpc.mockResolvedValue({
      data: { ...data, stats: { ...data.stats, average: score, best: score } },
      error: null,
    });
    render(
      await resolve(
        await Activity({ searchParams: Promise.resolve({ kind: "sprint" }) }),
      ),
    );
    expect(mocks.browser.mock.calls[0][0].data.stats).toEqual({
      ...data.stats,
      average: score,
      best: score,
    });
  },
);
it("retains RPC ordering for score sorts and the existing newest timestamp ordering", async () => {
  const older = {
    ...row,
    id: "older",
    started_at: "2026-10-07T00:00:00+00:00",
    pct: null,
    status: "Marking" as const,
  };
  mocks.rpc.mockResolvedValue({
    data: { ...data, rows: [older, row] },
    error: null,
  });
  render(
    await resolve(
      await Activity({ searchParams: Promise.resolve({ sort: "highest" }) }),
    ),
  );
  expect(mocks.browser.mock.calls[0][0].data.rows).toEqual([
    older,
    { ...row, title: "Short answer sprint · Trade" },
  ]);
  mocks.browser.mockClear();
  responses();
  render(await resolve(await Activity({ searchParams: Promise.resolve({}) })));
  expect(mocks.browser.mock.calls[0][0].data.rows).toEqual([
    { ...row, title: "Short answer sprint · Trade" },
    older,
  ]);
});
it.each([
  { error: { message: "failed" }, data: null },
  { error: null, data: null },
])("keeps RPC failures at the route error boundary (%j)", async (result) => {
  mocks.rpc.mockResolvedValue(result);
  await expect(Activity({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "Couldn't load your activity.",
  );
});
it("keeps count failures at the route error boundary", async () => {
  responses({ count: null });
  await expect(Activity({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "Couldn't load your activity.",
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
});
