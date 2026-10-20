import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
vi.mock("./feedback-widget", () => ({ useFeedback: () => vi.fn() }));
import { isTyping, SessionShell } from "./session-shell";
afterEach(() => {
  cleanup();
});
beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes("768"),
  })) as unknown as typeof window.matchMedia;
});

function shell(over: Partial<Parameters<typeof SessionShell>[0]> = {}) {
  const props = {
    title: "Due for review",
    flashcards: { known: 0, shortcuts: [["L", "List view"]] },
    position: 2,
    total: 8,
    answered: 3,
    saveState: "saved" as const,
    onRetry: vi.fn(),
    clock: { mode: "up" as const, seconds: 600 },
    onExit: vi.fn(),
    onFinish: vi.fn(),
    onMove: vi.fn(),
    children: <input aria-label="Answer" />,
    ...over,
  };
  return { props, ...render(<SessionShell {...props} />) };
}

it("shows position, progress and save state with a retry", () => {
  const { props } = shell({ saveState: "error" });
  expect(screen.getByText("Card 2 of 8")).toBeTruthy();
  expect(
    screen
      .getByRole("progressbar", { name: "Answered" })
      .getAttribute("aria-valuenow"),
  ).toBe("3");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(props.onRetry).toHaveBeenCalled();
});

it("counts up muted in untimed mode", () => {
  shell({ clock: { mode: "up", seconds: 65 } });
  expect(
    screen.getByRole("button", { name: "Time used 1:05" }).className,
  ).toContain("text-muted-foreground");
});

it("treats text fields as typing but not radio cards", () => {
  const text = document.createElement("textarea");
  const radio = Object.assign(document.createElement("input"), {
    type: "radio",
  });
  expect(isTyping(text)).toBe(true);
  expect(isTyping(radio)).toBe(false);
});

it("shows flashcard position and known count without the sprint tools", () => {
  shell({
    flashcards: { known: 5, shortcuts: [["L", "List view"]] },
    position: 7,
    total: 20,
    answered: 6,
    clock: { mode: "up", seconds: 42 },
  });
  expect(screen.getByText("Card 7 of 20")).toBeVisible();
  expect(screen.getByText("Knew 5")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Booklet (B)" })).toBeNull();
  expect(screen.getByRole("button", { name: "Time used 0:42" })).toBeVisible();
});

it("ignores J/K in flashcards while preserving arrow navigation", () => {
  const { props } = shell({ flashcards: { known: 0, shortcuts: [] } });
  for (const key of ["j", "J", "k", "K"]) fireEvent.keyDown(window, { key });
  expect(props.onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(props.onMove).toHaveBeenCalledWith(1);
});

it("uses compact flashcard metadata without a visible progress bar", () => {
  shell({ title: "Due for review", flashcards: { known: 1, shortcuts: [] } });
  expect(screen.getByText("Due for review")).toBeVisible();
  expect(screen.getByText("Card 2 of 8")).toBeVisible();
  expect(screen.getByText(/Knew 1/)).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "Answered" })).toHaveClass(
    "sr-only",
  );
  expect(
    screen.getByRole("button", { name: "Save and exit" }),
  ).toHaveTextContent("Save and exit");
  expect(
    screen
      .getAllByRole("button", { name: "Send feedback" })
      .some((button) => button.querySelector('[data-icon="flag"]')),
  ).toBeTruthy();
});

it("hides and restores the count-up timer", () => {
  shell({ clock: { mode: "up", seconds: 65 } });
  fireEvent.click(screen.getByRole("button", { name: "Time used 1:05" }));
  fireEvent.click(screen.getByRole("button", { name: "Show timer" }));
  expect(screen.getByRole("button", { name: "Time used 1:05" })).toBeVisible();
});

it("opens flashcard shortcuts and preserves exit and finish actions", async () => {
  const { props } = shell();
  fireEvent.click(screen.getByRole("button", { name: "Save and exit" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish" }));
  expect(props.onExit).toHaveBeenCalledOnce();
  expect(props.onFinish).toHaveBeenCalledOnce();
  fireEvent.keyDown(window, { key: "?" });
  expect(await screen.findByText("Keyboard shortcuts")).toBeVisible();
  expect(screen.getByText("List view")).toBeVisible();
});

it("ignores arrows while typing, modified or already handled", () => {
  const { props } = shell();
  fireEvent.keyDown(screen.getByLabelText("Answer"), { key: "ArrowRight" });
  fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true });
  const event = new KeyboardEvent("keydown", {
    key: "ArrowRight",
    cancelable: true,
  });
  event.preventDefault();
  window.dispatchEvent(event);
  expect(props.onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(props.onMove).toHaveBeenCalledWith(-1);
});
