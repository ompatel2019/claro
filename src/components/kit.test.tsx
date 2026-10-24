import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Target } from "@/components/icons";
vi.mock("next/navigation", () => ({
  usePathname: () => "/student/activity",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/form", () => ({
  default: (props: React.ComponentProps<"form">) => <form {...props} />,
}));
vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
import { FeedbackWidget } from "./feedback-widget";
import { activeItem, AppShell, nav } from "./app-shell";
import { DataTable, sortRows, type Column } from "./data-table";
import { EmptyState } from "./empty-state";
import { FilterBar, type Filter } from "./filter-bar";
import { PageHeader } from "./page-header";
afterEach(cleanup);

it("groups student and admin navigation without homework", () => {
  expect(nav.student.map((g) => g.label)).toEqual(["", "Practice", "Review"]);
  expect(nav.admin.map((g) => g.label)).toEqual([
    "",
    "People",
    "Content",
    "Marking",
  ]);
  const hrefs = Object.values(nav).flatMap((groups) =>
    groups.flatMap((g) => g.items.map((i) => i.href)),
  );
  expect(hrefs.some((h) => h.includes("homework"))).toBe(false);
});

it("marks the section root only on an exact match", () => {
  expect(activeItem("student", "/student")?.label).toBe("Home");
  expect(activeItem("student", "/student/sprint/abc/results")?.label).toBe(
    "Topic Sprint",
  );
  expect(activeItem("student", "/student/sprint")?.label).toBe("Topic Sprint");
  expect(activeItem("student", "/student/flashcards")?.label).toBe(
    "Flashcards",
  );
  expect(
    nav.student.flatMap((g) => g.items).find((i) => i.label === "Flashcards")
      ?.href,
  ).toBe("/student/flashcards");
  expect(activeItem("student", "/student/profile")).toBeUndefined();
  expect(activeItem("student", "/student/activity/check-id")?.label).toBe(
    "Activity",
  );
  expect(nav.student.flatMap((g) => g.items).map((i) => i.href)).toEqual([
    "/student",
    "/student/sprint",
    "/student/flashcards",
    "/student/mark",
    "/student/activity",
    "/student/progress",
  ]);
  expect(
    nav.admin.find((g) => g.label === "Marking")?.items.map((i) => i.label),
  ).toEqual(["Review queue", "Marking quality", "AI spend"]);
  expect(activeItem("admin", "/admin")?.label).toBe("Dashboard");
  expect(activeItem("admin", "/admin/students/x")?.label).toBe("Students");
  expect(activeItem("admin", "/admin/marking/review/x")?.label).toBe(
    "Review queue",
  );
  expect(activeItem("admin", "/admin/content/questions/new")?.label).toBe(
    "Questions",
  );
});

it.each([
  ["admin", "/admin/marking/review", "open"],
  ["student", "/student/flashcards", "due"],
] as const)("labels %s badges as %s", (kind, href, label) => {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList;
  render(
    <AppShell kind={kind} name="Test" defaultOpen badges={{ [href]: 3 }}>
      Content
    </AppShell>,
  );
  expect(screen.getByLabelText(`3 ${label}`)).toHaveTextContent("3");
});

it("renders the page header and empty state", () => {
  render(
    <>
      <PageHeader
        eyebrow="Eyebrow"
        title="Title"
        description="One line"
        actions={<button>Go</button>}
      />
      <EmptyState
        icon={Target}
        title="Nothing yet"
        description="Finish a sprint first."
        action={<button>Start</button>}
      />
    </>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Title");
  expect(screen.getByText("One line")).toBeInTheDocument();
  expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
});

it("sorts with missing values last in both directions", () => {
  const rows = [{ v: 2 }, { v: null }, { v: 1 }];
  expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([
    1,
    2,
    null,
  ]);
  expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([
    2,
    1,
    null,
  ]);
});

it("cycles a sortable header through ascending, descending and off", () => {
  type Row = { id: string; name: string };
  const columns: Column<Row>[] = [
    { id: "name", header: "Name", cell: (r) => r.name, sort: (r) => r.name },
  ];
  const rows = [
    { id: "1", name: "Bea" },
    { id: "2", name: "Al" },
    { id: "3", name: "Cy" },
  ];
  render(<DataTable label="People" columns={columns} rows={rows} />);
  const names = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent);
  const header = screen.getByRole("button", { name: "Name" });
  fireEvent.click(header);
  expect(names()).toEqual(["Al", "Bea", "Cy"]);
  expect(screen.getByRole("columnheader")).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  fireEvent.click(header);
  expect(names()).toEqual(["Cy", "Bea", "Al"]);
  fireEvent.click(header);
  expect(names()).toEqual(["Bea", "Al", "Cy"]);
});

it("counts active filters on Clear and hides it when none are set", () => {
  const filters: Filter[] = [
    {
      name: "mode",
      label: "Mode",
      all: "All modes",
      options: [{ value: "mcq", label: "Multiple choice" }],
    },
    { name: "q", label: "Search", placeholder: "Stem" },
  ];
  const { rerender } = render(<FilterBar filters={filters} values={{}} />);
  expect(screen.queryByRole("link", { name: /Clear/ })).toBeNull();
  rerender(
    <FilterBar
      filters={filters}
      values={{ mode: "mcq", q: "gdp" }}
      hidden={{ status: "new", page: undefined }}
    />,
  );
  expect(screen.getByRole("link", { name: "Clear (2)" })).toHaveAttribute(
    "href",
    "/student/activity?status=new",
  );
  expect(screen.getByLabelText("Mode")).toHaveValue("mcq");
  expect(screen.getByLabelText("Search")).toHaveValue("gdp");
});

it("opens a row without intercepting its link", () => {
  const onRow = vi.fn();
  const row = { id: "a", name: "Al" };
  render(
    <DataTable
      label="People"
      columns={[
        {
          id: "name",
          header: "Name",
          cell: (r) => <a href="/people/a">{r.name}</a>,
        },
        { id: "id", header: "ID", cell: (r) => r.id },
      ]}
      rows={[row]}
      onRow={onRow}
    />,
  );
  fireEvent.click(screen.getByText("a"));
  expect(onRow).toHaveBeenCalledWith(row);
  onRow.mockClear();
  fireEvent.click(screen.getByRole("link"));
  expect(onRow).not.toHaveBeenCalled();
});

it("leaves the sidebar shortcut alone while typing", () => {
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList;
  render(
    <AppShell kind="admin" name="Admin" defaultOpen>
      <input aria-label="Search" />
    </AppShell>,
  );
  const sidebar = document.querySelector('[data-slot="sidebar"]');
  const state = sidebar?.getAttribute("data-state");
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "b", ctrlKey: true });
  expect(sidebar).toHaveAttribute("data-state", state);
});

it("retains Progress and the admin marking navigation", () => {
  expect(activeItem("student", "/student/activity")?.label).toBe("Activity");
  expect(activeItem("student", "/student/progress")?.label).toBe("Progress");
  expect(activeItem("admin", "/admin/marking/accuracy")?.label).toBe(
    "Marking quality",
  );
  expect(activeItem("admin", "/admin/marking/engine")?.label).toBe(
    "Marking quality",
  );
});
it("retains checkbox filters and drops stale day inputs before changing range", () => {
  render(
    <FilterBar
      filters={[
        { name: "flagged", label: "Flagged only", checkbox: true },
        {
          name: "range",
          label: "Date",
          all: "All time",
          options: [{ value: "7", label: "7 days" }],
          clearOnChange: ["date"],
        },
      ]}
      values={{ flagged: "1" }}
      hidden={{ date: "2026-10-08" }}
    />,
  );
  expect(screen.getByRole("checkbox", { name: "Flagged only" })).toBeChecked();
  const select = screen.getByLabelText("Date") as HTMLSelectElement;
  const submitted = vi.fn();
  select.form!.requestSubmit = submitted;
  fireEvent.change(select, { target: { value: "7" } });
  expect(submitted).toHaveBeenCalledOnce();
  expect(new FormData(select.form!).has("date")).toBe(false);
  expect(new FormData(select.form!).get("flagged")).toBe("1");
});

it("shows the supplied exam countdown only for students without a global chat launcher", () => {
  const { rerender } = render(
    <AppShell kind="student" name="Test Student" defaultOpen examDays={7}>
      Content
    </AppShell>,
  );
  expect(screen.getByText("HSC Economics exam")).toBeVisible();
  expect(screen.getByText("7", { exact: true })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Ask Claro" })).toBeNull();
  rerender(
    <AppShell kind="student" name="Test Student" defaultOpen examDays={null}>
      Content
    </AppShell>,
  );
  expect(screen.queryByText("HSC Economics exam")).toBeNull();
  rerender(
    <AppShell kind="admin" name="Admin" defaultOpen examDays={7}>
      Content
    </AppShell>,
  );
  expect(screen.queryByText("HSC Economics exam")).toBeNull();
  expect(screen.queryByRole("button", { name: "Send feedback" })).toBeNull();
  expect(screen.getByRole("link", { name: "Feedback" })).toHaveAttribute(
    "href",
    "/admin/feedback",
  );
  expect(screen.queryByRole("button", { name: "Ask Claro" })).toBeNull();
});

it("opens the existing feedback dialog from the main nav and both account menus", async () => {
  render(
    <FeedbackWidget userId="student">
      <AppShell kind="student" name="Test Student" defaultOpen>
        Content
      </AppShell>
    </FeedbackWidget>,
  );
  const feedback = screen.getByRole("button", { name: "Send feedback" });
  expect(feedback.closest("nav")).toHaveAttribute(
    "aria-label",
    "Main navigation",
  );
  expect(screen.queryByRole("link", { name: "Send feedback" })).toBeNull();
  fireEvent.click(feedback);
  expect(
    await screen.findByRole("dialog", { name: "Send feedback" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  for (const trigger of ["User menu", "Account menu"]) {
    fireEvent.click(screen.getByRole("button", { name: trigger }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Send feedback" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Send feedback" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  }
});

it("gives admin the shared shell navigation, top bar and account footer", () => {
  const { container } = render(
    <AppShell kind="admin" name="Synthetic Admin" defaultOpen>
      Content
    </AppShell>,
  );
  const dashboard = screen.getByRole("link", { name: "Dashboard" });
  expect(dashboard).toHaveClass("shell-nav-button");
  expect(dashboard.querySelector(".nav-label")).not.toBeNull();
  expect(dashboard.querySelector("svg")).toHaveAttribute(
    "data-icon",
    "layout-grid",
  );
  expect(container.querySelector(".shell-frame .shell-sidebar")).not.toBeNull();
  expect(container.querySelector('[data-component="TopBar"]')).toHaveClass(
    "h-16",
    "bg-background",
  );
  expect(screen.getByRole("button", { name: "Account menu" })).toHaveClass(
    "shell-account-menu",
    "md:hidden",
  );
  expect(
    screen.getByRole("button", { name: "User menu" }).querySelector("svg"),
  ).toHaveAttribute("data-icon", "more");
  expect(
    screen.getByRole("navigation", { name: "Admin navigation" }),
  ).toHaveTextContent(
    "DashboardPeopleStudentsFeedbackContentQuestionsFlashcardsMarkingReview queueMarking qualityAI spend",
  );
});

it.each(["student", "admin"] as const)(
  "keeps the %s desktop toggle in the sidebar logo row",
  (kind) => {
    const { container } = render(
      <AppShell kind={kind} name="Test" defaultOpen>
        Content
      </AppShell>,
    );
    const header = container.querySelector('[data-slot="sidebar-header"]')!;
    const toggle = header.querySelector('button[data-sidebar="trigger"]')!;
    expect(toggle).toHaveAccessibleName("Toggle Sidebar");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(header.firstElementChild?.tagName).toBe("A");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      "data-collapsible",
      "icon",
    );
    const mobileToggle = container.querySelector(
      '[data-component="TopBar"] [data-sidebar="trigger"]',
    );
    expect(mobileToggle).toHaveClass("md:hidden");
    expect(mobileToggle).not.toHaveAttribute("aria-expanded");
  },
);
