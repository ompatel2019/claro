import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/student/activity",
}));
vi.mock("next/form", () => ({
  default: (props: React.ComponentProps<"form">) => <form {...props} />,
}));
import { ActivityBrowser } from "./activity-browser";
import {
  parseActivityFilters,
  type ActivityData,
  type ActivityRow,
} from "@/lib/activity-filters";
import ActivityError from "@/app/(app)/student/activity/error";
import ActivityLoading from "@/app/(app)/student/activity/loading";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const filters = parseActivityFilters({}, "2026-10-09");
const row: ActivityRow = {
  id: "s",
  kind: "sprint",
  title: "Short answer sprint · Inflation",
  status: "Finished",
  provisional: false,
  study: false,
  pct: 75,
  items: 8,
  answered: 8,
  elapsed_s: 65,
  started_at: "2026-10-09T00:00:00Z",
  finished_at: "2026-10-09T00:01:00Z",
};
const data: ActivityData = {
  rows: [row],
  page: 1,
  total: 25,
  all_total: 25,
  kinds: { sprint: 25 },
  kind_total: 25,
  stats: { sessions: 25, questions: 200, average: 75, best: 75 },
};
const show = (d = data, f = filters) =>
  render(
    <ActivityBrowser data={d} filters={f} topics={[]} today="2026-10-09" />,
  );
it("links rows to canonical reports and preserves filters in pagination", () => {
  show(data, { ...filters, kind: "sprint" });
  expect(screen.getByRole("link", { name: row.title })).toHaveAttribute(
    "href",
    "/student/activity/s",
  );
  expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute(
    "href",
    "/student/activity?kind=sprint&page=2",
  );
  expect(screen.getByText("75%").closest("li")).toContainElement(
    screen.getByRole("link", { name: row.title }),
  );
});
it("uses distinct first-use and filtered empty actions", () => {
  show({ ...data, rows: [], all_total: 0 });
  expect(screen.getByText("Nothing here yet")).toBeVisible();
  expect(screen.getByRole("link", { name: "Start sprint" })).toHaveAttribute(
    "href",
    "/student/sprint",
  );
  cleanup();
  show({ ...data, rows: [] });
  expect(screen.getByText("No sessions match")).toBeVisible();
  expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
    "href",
    "/student/activity",
  );
});
it("kind chips reset paging while retaining other filters", () => {
  show(data, { ...filters, q: "Inflation", page: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Sprints 25" }));
  expect(push).toHaveBeenCalledWith(
    "/student/activity?kind=sprint&q=Inflation",
  );
});
it("shows the heatmap day chip and removes it", () => {
  show(data, parseActivityFilters({ date: "2026-10-08" }, "2026-10-09"));
  fireEvent.click(screen.getByRole("button", { name: "Remove day filter" }));
  expect(push).toHaveBeenCalledWith("/student/activity");
});
it("has an in-card error and skeleton rows", () => {
  const reset = vi.fn();
  render(<ActivityError unstable_retry={reset} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Couldn't load this. Try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reset).toHaveBeenCalledOnce();
  cleanup();
  render(<ActivityLoading />);
  expect(
    screen.getByRole("status", { name: "Loading activity" }),
  ).toBeVisible();
});

it("keeps pending scores hidden and provisional marks labelled", () => {
  show({
    ...data,
    rows: [{ ...row, status: "Marking", provisional: true, pct: 90 }],
  });
  expect(screen.queryByText("90%")).not.toBeInTheDocument();
  expect(screen.getAllByText("Provisional")).toHaveLength(1);
  cleanup();
  show({
    ...data,
    rows: [{ ...row, kind: "flashcards", study: true, pct: 100 }],
  });
  expect(screen.getByLabelText("Study session, no score")).toHaveTextContent(
    "—",
  );
});

it("links a single-answer session to its own report", () => {
  show({
    ...data,
    rows: [{ ...row, kind: "single", title: "Mark my answer" }],
  });
  for (const link of screen.getAllByRole("link", { name: /Mark my answer/ }))
    expect(link).toHaveAttribute("href", "/student/activity/s");
});
it("sorts on the server, resets paging and clears every external filter", () => {
  show(
    data,
    parseActivityFilters(
      { kind: "sprint", date: "2026-10-08", page: "2" },
      "2026-10-09",
    ),
  );
  expect(
    screen.getByRole("link", { name: "Clear filters (2)" }),
  ).toHaveAttribute("href", "/student/activity");
  const form = screen.getByRole("textbox", { name: "Search" }).closest("form")!;
  const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => {});
  fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), {
    target: { value: "oldest" },
  });
  expect(submit).toHaveBeenCalledOnce();
  expect(Object.fromEntries(new FormData(form))).toMatchObject({
    kind: "sprint",
    sort: "oldest",
    date: "2026-10-08",
  });
  submit.mockRestore();
});

it("summarises what the filters show", () => {
  show();
  expect(
    screen.getByText("25 sessions · 200 questions answered · average 75%"),
  ).toBeInTheDocument();
});

it("ignores a legacy paper session alongside supported activity", () => {
  show({
    ...data,
    rows: [
      row,
      { ...row, id: "old-paper", kind: "paper", title: "Removed session" },
    ],
  });
  expect(screen.queryByText("Removed session")).toBeNull();
  expect(screen.getAllByRole("link", { name: row.title })[0]).toHaveAttribute(
    "href",
    "/student/activity/s",
  );
});

it("separates sessions and results, groups newest history and shows duration", () => {
  show();
  const list = screen.getByRole("region", { name: "Your activity" });
  expect(screen.getByText("Short answer sprint")).toHaveAttribute(
    "title",
    row.title,
  );
  expect(
    screen.getByRole("heading", { name: /^Today · Fri 9 Oct/ }),
  ).toBeInTheDocument();
  expect(screen.getByText("2 min")).toBeInTheDocument();
  expect(screen.getByText("1:05")).toBeInTheDocument();
  expect(screen.getByText("75%")).toBeInTheDocument();
  expect(list).not.toHaveTextContent("Finished");
  expect(screen.getByText("11:00am")).toBeInTheDocument();
});

it("does not group score-sorted history into misleading day buckets", () => {
  show(data, { ...filters, sort: "highest" });
  expect(screen.queryByRole("heading", { name: /^Today/ })).toBeNull();
  expect(screen.getByText("Fri 9 Oct, 11:00am")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: row.title })).toBeVisible();
});

it("preserves every GET field when search or another filter is submitted", () => {
  show(data, {
    ...filters,
    kind: "sprint",
    status: "finished",
    topic: "t1",
    q: "Inflation",
    sort: "highest",
    range: "custom",
    from: "2026-10-01",
    to: "2026-10-09",
  });
  const form = screen.getByRole("textbox", { name: "Search" }).closest("form")!;
  const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => {});
  fireEvent.change(screen.getByRole("textbox", { name: "Search" }), {
    target: { value: "Trade" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
    target: { value: "marking" },
  });
  expect(submit).toHaveBeenCalledOnce();
  const fields = new FormData(form);
  expect(Object.fromEntries(fields)).toMatchObject({
    kind: "sprint",
    status: "marking",
    q: "Trade",
    sort: "highest",
    range: "custom",
    from: "2026-10-01",
    to: "2026-10-09",
  });
  expect(fields.has("page")).toBe(false);
  submit.mockRestore();
});

it("clears an exact day when choosing a relative date range", () => {
  show(
    data,
    parseActivityFilters({ date: "2026-10-08", kind: "sprint" }, "2026-10-09"),
  );
  const form = screen.getByRole("textbox", { name: "Search" }).closest("form")!;
  const submit = vi.spyOn(form, "requestSubmit").mockImplementation(() => {});
  fireEvent.change(screen.getByRole("combobox", { name: "Date" }), {
    target: { value: "30" },
  });
  expect(submit).toHaveBeenCalledOnce();
  const fields = new FormData(form);
  expect(fields.has("date")).toBe(false);
  expect(fields.get("range")).toBe("30");
  expect(fields.get("kind")).toBe("sprint");
  submit.mockRestore();
});

it("groups sessions by Sydney dates including sessions across midnight UTC", () => {
  show({
    ...data,
    rows: [
      { ...row, id: "today", started_at: "2026-10-08T14:00:00Z" },
      { ...row, id: "yesterday", started_at: "2026-10-08T00:00:00Z" },
      { ...row, id: "week", started_at: "2026-10-06T00:00:00Z" },
      { ...row, id: "earlier", started_at: "2026-10-01T00:00:00Z" },
    ],
  });
  for (const label of [
    "Today · Fri 9 Oct",
    "Yesterday · Thu 8 Oct",
    "Tue 6 Oct",
    "Thu 1 Oct",
  ])
    expect(
      screen.getByRole("heading", { name: new RegExp(`^${label}`) }),
    ).toBeInTheDocument();
});

it("reveals additional sessions without replacing the visible history", () => {
  show({
    ...data,
    rows: Array.from({ length: 14 }, (_, i) => ({
      ...row,
      id: `s${i}`,
      title: `Mixed sprint · Topic ${i}`,
    })),
    total: 14,
  });
  expect(screen.getByText("Showing 12 of 14")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Mixed sprint · Topic 13" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(screen.getByText("Showing 14 of 14")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Mixed sprint · Topic 0" }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Mixed sprint · Topic 13" }),
  ).toBeVisible();
});

it("shows actual card ratings and uses the latest rating for each card", () => {
  render(
    <ActivityBrowser
      filters={filters}
      data={{
        ...data,
        rows: [
          {
            ...row,
            kind: "flashcards",
            title: "Flashcards · Study",
            study: true,
            pct: null,
            items: 2,
          },
        ],
      }}
      topics={[]}
      today="2026-10-09"
      details={{
        s: {
          config: {},
          flashcard_reviews: [
            { flashcard_id: "a", mark: 1, created_at: "2026-10-09T00:00:00Z" },
            { flashcard_id: "a", mark: 0, created_at: "2026-10-09T01:00:00Z" },
            { flashcard_id: "b", mark: 1, created_at: "2026-10-09T00:00:00Z" },
          ],
        },
      }}
    />,
  );
  expect(screen.getByText("knew it").previousElementSibling).toHaveTextContent(
    "1/2",
  );
});
