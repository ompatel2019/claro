/// <reference types="vite/client" />
import { expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/components/feedback-widget", () => ({
  useFeedback: () => () => {},
}));
import { activeItem, nav, MobileTabs, studentTab } from "./app-shell";

const pages = import.meta.glob("../app/**/page.tsx", {
  eager: true,
  query: "?raw",
  import: "default",
});

it("has no dead admin navigation links or removed content entry", () => {
  const items = nav.admin.flatMap((group) => group.items);
  expect(items.map((item) => item.label)).not.toContain("Papers");
  for (const item of items) {
    expect(item.href).not.toContain("/admin/content/papers");
    expect(Object.keys(pages)).toContain(`../app${item.href}/page.tsx`);
  }
  expect(activeItem("admin", "/admin/content/papers")).toBeUndefined();
  expect(activeItem("admin", "/admin/content/papers/old")).toBeUndefined();
  expect(activeItem("admin", "/admin/content/questions/new")?.label).toBe(
    "Questions",
  );
});

it("keeps the default student activity navigation", () => {
  expect(activeItem("student", "/student/activity/result")?.label).toBe(
    "Activity",
  );
  expect(activeItem("student", "/student/mark")?.label).toBe("Mark my answer");
});

import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach } from "vitest";
import { ActiveNav, ActiveNavProvider, useActiveNav } from "./claro/active-nav";
afterEach(cleanup);

function CurrentNav({ path }: { path: string }) {
  const override = useActiveNav(path);
  return <output>{activeItem("student", override ?? path)?.label}</output>;
}

it("scopes a page override to its route and clears it on unmount", () => {
  const path = "/student/activity/single";
  const view = (show: boolean, current = path) => (
    <ActiveNavProvider>
      <CurrentNav path={current} />
      {show && <ActiveNav href="/student/mark" path={path} />}
    </ActiveNavProvider>
  );
  const { rerender } = render(view(true));
  expect(screen.getByRole("status")).toHaveTextContent("Mark my answer");
  rerender(view(true, "/student/activity"));
  expect(screen.getByRole("status")).toHaveTextContent("Activity");
  rerender(view(false));
  expect(screen.getByRole("status")).toHaveTextContent("Activity");
});

const mobile = vi.hoisted(() => ({ setOpenMobile: vi.fn() }));
vi.mock("@/components/ui/sidebar", async (original) => ({
  ...(await original<typeof import("@/components/ui/sidebar")>()),
  useSidebar: () => ({
    setOpenMobile: mobile.setOpenMobile,
    openMobile: false,
  }),
}));
it("keeps the four phone destinations and opens the existing drawer from More", () => {
  render(
    <MobileTabs activeHref={studentTab("/student/activity", "finished")} />,
  );
  expect(
    screen.getAllByRole("link").map((a) => a.getAttribute("href")),
  ).toEqual([
    "/student",
    "/student/sprint",
    "/student/progress",
    "/student/activity?status=finished",
  ]);
  expect(screen.getByRole("link", { name: "Feedback" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  fireEvent.click(screen.getByRole("button", { name: "More navigation" }));
  expect(mobile.setOpenMobile).toHaveBeenCalledWith(true);
});

it.each([
  ["/student", null, "Home"],
  ["/student/sprint", null, "Sprint"],
  ["/student/sprint/session", null, "Sprint"],
  ["/student/progress", null, "Progress"],
  ["/student/activity", null, "More"],
  ["/student/activity", "progress", "More"],
  ["/student/activity", "finished", "Feedback"],
  ["/student/activity/synthetic-result", null, "Feedback"],
  ["/student/flashcards", null, "More"],
  ["/student/mark", null, "More"],
  ["/student/profile", null, "More"],
])("marks the correct phone tab for %s (status %s)", (path, status, tab) => {
  render(<MobileTabs activeHref={studentTab(path, status)} />);
  const tabs = screen.getByRole("navigation", { name: "Phone navigation" });
  const current = tabs.querySelectorAll('[aria-current="page"]');
  expect(current).toHaveLength(1);
  expect(current[0].textContent).toBe(tab);
  expect(current[0].querySelector(".nav-pen")).not.toBeNull();
});
