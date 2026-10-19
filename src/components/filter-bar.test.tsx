import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
const submit = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/feedback" }));
vi.mock("next/form", () => ({
  default: ({ action, ...props }: React.ComponentProps<"form">) => (
    <form
      {...props}
      action={typeof action === "string" ? action : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        submit(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    />
  ),
}));
import { FilterBar } from "./filter-bar";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  submit.mockClear();
});
it("submits the chosen custom option with other filters and clears dependent URL fields", async () => {
  const submissions: FormData[] = [];
  vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(
    function (this: HTMLFormElement) {
      submissions.push(new FormData(this));
    },
  );
  render(
    <FilterBar
      customSelect
      hidden={{ page: "3", status: "draft" }}
      values={{}}
      filters={[
        {
          name: "topic",
          label: "Topic",
          all: "All topics",
          options: [{ value: "child", label: "Inflation" }],
          clearOnChange: ["page"],
        },
        { name: "q", label: "Search", placeholder: "Search questions" },
      ]}
    />,
  );
  expect(submissions).toHaveLength(0);
  fireEvent.change(screen.getByPlaceholderText("Search questions"), {
    target: { value: "prices" },
  });
  fireEvent.click(screen.getByRole("combobox", { name: "Topic" }));
  {
    const option = await screen.findByRole("option", { name: "Inflation" });
    fireEvent.mouseMove(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
  }
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(submissions[0].get("topic")).toBe("child");
  expect(submissions[0].get("q")).toBe("prices");
  expect(submissions[0].get("status")).toBe("draft");
  expect(submissions[0].has("page")).toBe(false);
  fireEvent.click(screen.getByRole("combobox", { name: "Topic" }));
  {
    const option = await screen.findByRole("option", { name: "All topics" });
    fireEvent.mouseMove(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
  }
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1].get("topic")).toBe("");
});

it("keeps keyboard selection, submission and navigation values in sync", async () => {
  const submissions: FormData[] = [];
  vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(
    function (this: HTMLFormElement) {
      submissions.push(new FormData(this));
    },
  );
  const filters = [
    {
      name: "topic",
      label: "Topic",
      all: "All topics",
      options: [{ value: "child", label: "Inflation" }],
    },
  ];
  const { rerender } = render(
    <FilterBar
      customSelect
      values={{}}
      filters={filters}
      hidden={{ status: "draft" }}
    />,
  );
  const trigger = screen.getByRole("combobox", { name: "Topic" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const option = await screen.findByRole("option", { name: "Inflation" });
  fireEvent.keyDown(option, { key: "Enter" });
  await waitFor(() => expect(submissions).toHaveLength(1));
  expect(submissions[0].get("topic")).toBe("child");
  expect(submissions[0].get("status")).toBe("draft");
  rerender(
    <FilterBar
      customSelect
      values={{ topic: "child" }}
      filters={filters}
      hidden={{ status: "draft" }}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent(
    "Inflation",
  );
  rerender(
    <FilterBar
      customSelect
      values={{}}
      filters={filters}
      hidden={{ status: "live" }}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent(
    "All topics",
  );
  expect(submissions).toHaveLength(1);
  const data = new FormData(
    screen.getByRole("combobox", { name: "Topic" }).closest("form")!,
  );
  expect(data.get("topic")).toBe("");
  expect(data.get("status")).toBe("live");
});

it("keeps the shipped select and checkbox behaviour and stable accessible labels", () => {
  render(
    <FilterBar
      values={{ kind: "bug", shots: "1" }}
      hidden={{ status: "new" }}
      filters={[
        {
          name: "kind",
          label: "Kind",
          all: "Any",
          options: [{ value: "bug", label: "Bug" }],
        },
        { name: "shots", label: "Has screenshots", checkbox: true },
      ]}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Kind" })).toHaveValue("bug");
  fireEvent.click(screen.getByRole("checkbox", { name: "Has screenshots" }));
  expect(submit).toHaveBeenLastCalledWith({ status: "new", kind: "bug" });
  expect(screen.getByRole("link", { name: "Clear (2)" })).toHaveAttribute(
    "href",
    "/admin/feedback?status=new",
  );
});
it("submits opt-in chips with the other form fields", () => {
  render(
    <FilterBar
      values={{ q: "timer" }}
      hidden={{ status: "new" }}
      filters={[
        {
          name: "kind",
          label: "Kind",
          all: "Any",
          chips: true,
          options: [{ value: "bug", label: "Bug" }],
        },
        { name: "q", label: "Search", placeholder: "Message or student" },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Bug" }));
  expect(submit).toHaveBeenLastCalledWith({
    status: "new",
    kind: "bug",
    q: "timer",
  });
});
it("submits Calendar endpoints from its portal through the owning form", async () => {
  render(
    <FilterBar
      values={{ from: "2026-10-08", to: "2026-10-09" }}
      hidden={{ status: "triaged" }}
      filters={[
        {
          name: "dates",
          label: "Date range",
          dateRange: { from: "from", to: "to", today: "2026-10-10" },
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /8 Oct.*9 Oct/ }));
  fireEvent.click(await screen.findByRole("button", { name: "2026-10-07" }));
  await waitFor(() =>
    expect(submit).toHaveBeenLastCalledWith({
      status: "triaged",
      from: "2026-10-07",
      to: "2026-10-09",
    }),
  );
});

it("shows 'Any date' on the date button instead of repeating the label", () => {
  render(
    <FilterBar
      values={{}}
      filters={[
        {
          name: "dates",
          label: "Date range",
          dateRange: { from: "from", to: "to", today: "2026-10-10" },
        },
      ]}
    />,
  );
  const button = screen.getByRole("button", { name: "Date range: Any date" });
  expect(button).toHaveTextContent(/^Any date$/);
  expect(screen.getAllByText("Date range")).toHaveLength(1);
});

it("keeps search and primary inline and moves active overflow filters into a sheet", async () => {
  render(
    <FilterBar
      primary="year"
      values={{ q: "lee", year: "12", activity: "active", flagged: "1" }}
      hidden={{ status: "live" }}
      filters={[
        { name: "q", label: "Search", placeholder: "Student name" },
        {
          name: "year",
          label: "Year",
          all: "All years",
          options: [{ value: "12", label: "Year 12" }],
        },
        {
          name: "activity",
          label: "Activity",
          all: "Any activity",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        },
        { name: "flagged", label: "Flagged only", checkbox: true },
      ]}
    />,
  );

  const mobile = document.querySelector(
    '[data-slot="filter-bar-mobile"]',
  ) as HTMLElement;
  expect(within(mobile).getByLabelText("Search")).toHaveValue("lee");
  expect(within(mobile).getByLabelText("Year")).toHaveValue("12");
  expect(within(mobile).queryByLabelText("Activity")).toBeNull();
  const filtersButton = within(mobile).getByRole("button", {
    name: "Filters (2 active)",
  });
  expect(filtersButton).toBeInTheDocument();

  fireEvent.click(filtersButton);
  const dialog = await screen.findByRole("dialog");
  const activity = within(dialog).getByLabelText("Activity");
  expect(activity).toHaveValue("active");
  expect(within(dialog).getByLabelText("Flagged only")).toBeChecked();
  expect(
    within(dialog).getByRole("link", { name: "Clear filters" }),
  ).toHaveAttribute("href", "/admin/feedback?status=live&q=lee&year=12");
  fireEvent.change(activity, { target: { value: "inactive" } });
  expect(submit).toHaveBeenLastCalledWith({
    status: "live",
    q: "lee",
    year: "12",
    activity: "inactive",
    flagged: "1",
  });
  expect(screen.queryByRole("button", { name: /^Apply/ })).toBeNull();
});
