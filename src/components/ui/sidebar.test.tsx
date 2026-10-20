import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mobile = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile.value }));
import { Sidebar, SidebarProvider, SidebarTrigger } from "./sidebar";
afterEach(() => {
  cleanup();
  mobile.value = false;
});

function shell(defaultOpen = true) {
  return render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon">
        <a href="/student">Home</a>
      </Sidebar>
      <SidebarTrigger />
      <input aria-label="Answer" />
    </SidebarProvider>,
  );
}

it("toggles the icon sidebar and persists its state through clicks and shortcuts", () => {
  shell(false);
  const sidebar = document.querySelector('[data-slot="sidebar"]');
  expect(sidebar).toHaveAttribute("data-state", "collapsed");
  expect(sidebar).toHaveAttribute("data-collapsible", "icon");
  fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
  expect(sidebar).toHaveAttribute("data-state", "expanded");
  expect(document.cookie).toContain("sidebar_state=true");
  fireEvent.keyDown(window, { key: "b", ctrlKey: true });
  expect(sidebar).toHaveAttribute("data-state", "collapsed");
  expect(document.cookie).toContain("sidebar_state=false");
  fireEvent.keyDown(screen.getByLabelText("Answer"), {
    key: "b",
    metaKey: true,
  });
  expect(sidebar).toHaveAttribute("data-state", "collapsed");
  fireEvent.keyDown(window, { key: "b", metaKey: true });
  expect(sidebar).toHaveAttribute("data-state", "expanded");
});

it("opens the mobile sidebar and closes it when a navigation link is selected", async () => {
  mobile.value = true;
  shell();
  expect(screen.queryByRole("link", { name: "Home" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
  expect(await screen.findByRole("dialog", { name: "Sidebar" })).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Home" }));
  expect(screen.queryByRole("dialog", { name: "Sidebar" })).toBeNull();
});
