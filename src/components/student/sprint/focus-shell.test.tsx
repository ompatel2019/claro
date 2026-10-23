import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SprintFocusShell } from "./focus-shell";
const feedback = vi.hoisted(() => vi.fn());
vi.mock("@/components/feedback-widget", () => ({
  useFeedback: () => feedback,
}));
vi.mock("@/components/calculator", () => ({
  Calculator: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close calculator</button>
  ),
}));
afterEach(cleanup);
function show() {
  const onExit = vi.fn(),
    onFinish = vi.fn(),
    onRetry = vi.fn(),
    onMove = vi.fn();
  render(
    <SprintFocusShell
      title="Mixed sprint"
      position={2}
      total={4}
      answered={1}
      saveState="error"
      onRetry={onRetry}
      clock={{ mode: "down", seconds: 600 }}
      onExit={onExit}
      onFinish={onFinish}
      onMove={onMove}
      booklet={<p>Questions</p>}
    >
      <p>Question content</p>
    </SprintFocusShell>,
  );
  return { onExit, onFinish, onRetry, onMove };
}
it("shows real progress, routes recovery controls and preserves timer hiding", () => {
  const actions = show();
  expect(screen.getByText("Question 2 of 4 · 1 answered ·")).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "Answered" })).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save and exit" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(actions.onExit).toHaveBeenCalledOnce();
  expect(actions.onFinish).toHaveBeenCalledOnce();
  expect(actions.onRetry).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Time remaining 10:00" }));
  expect(screen.getByRole("button", { name: "Show timer" })).toBeVisible();
});
it("handles navigation shortcuts while leaving consumed MC answer keys alone", () => {
  const actions = show();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(actions.onMove).toHaveBeenCalledWith(1);
  const consumed = new KeyboardEvent("keydown", { key: "c", cancelable: true });
  consumed.preventDefault();
  fireEvent(window, consumed);
  expect(screen.queryByRole("button", { name: "Close calculator" })).toBeNull();
  fireEvent.keyDown(window, { key: "c" });
  expect(
    screen.getByRole("button", { name: "Close calculator" }),
  ).toBeVisible();
});

it("labels calculator and feedback separately from flagging", () => {
  show();
  const calculator = screen.getByRole("button", { name: "Calculator (C)" });
  expect(calculator).toHaveTextContent("Calculator");
  fireEvent.click(calculator);
  expect(
    screen.getByRole("button", { name: "Close calculator" }),
  ).toBeVisible();
  const trigger = screen
    .getAllByRole("button", { name: "Send feedback" })
    .find((button) => button.textContent === "Send feedback")!;
  expect(trigger).toHaveTextContent("Send feedback");
  expect(trigger.querySelector('[data-icon="message-circle"]')).toBeTruthy();
  fireEvent.click(trigger);
  expect(feedback).toHaveBeenCalledOnce();
});

it("announces the mobile booklet sheet state independently of the desktop rail", () => {
  show();
  const mobile = screen
    .getAllByRole("button", { name: "Booklet (B)" })
    .find((button) => button.hasAttribute("aria-expanded"))!;
  expect(mobile).toHaveAttribute("aria-expanded", "false");
  expect(mobile).not.toHaveAttribute("aria-pressed");
  fireEvent.click(mobile);
  expect(mobile).toHaveAttribute("aria-expanded", "true");
  expect(
    document.getElementById(mobile.getAttribute("aria-controls")!),
  ).toHaveAttribute("role", "dialog");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(mobile).toHaveAttribute("aria-expanded", "false");
});
