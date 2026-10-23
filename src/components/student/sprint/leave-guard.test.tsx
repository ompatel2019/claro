/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors model every link the guard sees */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  LEAVE_MESSAGE,
  LeaveSprintDialog,
  leavingLink,
  leftKey,
  useLeaveGuard,
} from "./leave-guard";

function Guard({
  active,
  onAsk,
  unsaved = false,
}: {
  active: boolean;
  onAsk: () => void;
  unsaved?: boolean;
}) {
  useLeaveGuard({ sessionId: "s", active, onAsk, unsaved: () => unsaved });
  return (
    <>
      <a href="/student">Home</a>
      <a href="/student/activity/s" data-leave-ok>
        View results
      </a>
      <a href="/student/sprint/s#q2">Same page</a>
      <a href="https://example.com/">Elsewhere</a>
    </>
  );
}
const beacon = vi.fn();
beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/student/sprint/s");
  Object.defineProperty(navigator, "sendBeacon", {
    value: beacon,
    configurable: true,
  });
  beacon.mockReset();
});
afterEach(cleanup);

it("uses the agreed copy", () => {
  expect(LEAVE_MESSAGE).toBe(
    "Leaving ends this sprint. Your answered questions will be marked.",
  );
  render(
    <LeaveSprintDialog
      open
      onOpenChange={() => {}}
      busy={false}
      onLeave={() => {}}
    />,
  );
  expect(
    screen.getByRole("alertdialog", { name: "Leave this sprint?" }),
  ).toHaveTextContent(LEAVE_MESSAGE);
  expect(screen.getByRole("button", { name: "Keep working" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Leave and mark" })).toBeVisible();
});

it("asks before in-app links leave, and lets same-page, external and allowed links through", () => {
  const ask = vi.fn();
  render(<Guard active onAsk={ask} />);
  const home = screen.getByRole("link", { name: "Home" });
  expect(fireEvent.click(home)).toBe(false);
  expect(ask).toHaveBeenCalledOnce();
  for (const name of ["View results", "Same page", "Elsewhere"]) {
    const link = screen.getByRole("link", { name });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
  }
  expect(ask).toHaveBeenCalledOnce();
  // Modified clicks open a new tab and leave the sprint running.
  fireEvent.click(home, { metaKey: true });
  expect(ask).toHaveBeenCalledOnce();
});

it("asks on browser back and keeps the page", () => {
  const ask = vi.fn();
  render(<Guard active onAsk={ask} />);
  const depth = window.history.length;
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(ask).toHaveBeenCalledOnce();
  expect(window.history.length).toBe(depth + 1);
  expect(window.location.pathname).toBe("/student/sprint/s");
});

it("prompts on unload and finishes with a beacon once the page goes", () => {
  render(<Guard active onAsk={vi.fn()} />);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  expect(beacon).toHaveBeenCalledWith("/api/sessions/s/finish");
  expect(sessionStorage.getItem(leftKey("s"))).toBeNull();
});

it("never finishes on unload while an answer is still saving; the next load does", () => {
  render(<Guard active onAsk={vi.fn()} unsaved />);
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  expect(beacon).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(leftKey("s"))).toBe("1");
});

it("does nothing once the sprint is finishing", () => {
  const ask = vi.fn();
  render(<Guard active={false} onAsk={ask} />);
  fireEvent.click(screen.getByRole("link", { name: "Home" }));
  window.dispatchEvent(new PopStateEvent("popstate"));
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  window.dispatchEvent(
    new PageTransitionEvent("pagehide", { persisted: false }),
  );
  expect(ask).not.toHaveBeenCalled();
  expect(unload.defaultPrevented).toBe(false);
  expect(beacon).not.toHaveBeenCalled();
});

it("only counts plain same-origin navigations", () => {
  const link = document.createElement("a");
  link.href = "/student/activity";
  link.target = "_blank";
  document.body.append(link);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  Object.defineProperty(click, "target", { value: link });
  expect(leavingLink(click, "http://localhost:3000/student/sprint/s")).toBe(
    false,
  );
  link.removeAttribute("target");
  expect(leavingLink(click, `${window.location.origin}/student/sprint/s`)).toBe(
    true,
  );
  link.remove();
});
