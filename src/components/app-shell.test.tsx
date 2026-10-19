/// <reference types="vite/client" />
import { expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/components/feedback-widget", () => ({
  useFeedback: () => () => {},
}));
import { activeItem, nav } from "./app-shell";

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

import { cleanup, render, screen } from "@testing-library/react";
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
