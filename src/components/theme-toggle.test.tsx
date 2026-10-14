import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { THEME_KEY } from "@/lib/theme";
import { setTheme, ThemeToggle } from "./theme-toggle";

let media: EventTarget & { matches: boolean };
beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
  localStorage.clear();
  setTheme("system");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("toggles the class, accessible pressed state and saved choice", () => {
  render(<ThemeToggle />);
  const button = screen.getByRole("button", { name: "Dark mode" });
  expect(button).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(document.documentElement).toHaveClass("dark");
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  fireEvent.click(button);
  expect(document.documentElement).not.toHaveClass("dark");
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
});
it("tracks live system changes until overridden, then allows reset", () => {
  render(<ThemeToggle />);
  act(() => {
    media.matches = true;
    media.dispatchEvent(new Event("change"));
  });
  expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button"));
  act(() => media.dispatchEvent(new Event("change")));
  expect(document.documentElement).not.toHaveClass("dark");
  act(() => setTheme("system"));
  expect(localStorage.getItem(THEME_KEY)).toBeNull();
  expect(document.documentElement).toHaveClass("dark");
});
it("responds to other tabs and storage clear, and removes listeners", () => {
  const remove = vi.spyOn(media, "removeEventListener");
  const { unmount } = render(<ThemeToggle />);
  act(() => {
    localStorage.setItem(THEME_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY }));
  });
  expect(document.documentElement).toHaveClass("dark");
  act(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });
  expect(document.documentElement).not.toHaveClass("dark");
  unmount();
  expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
});
it("keeps toggling when reads and writes are blocked", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button"));
  expect(document.documentElement).toHaveClass("dark");
  fireEvent.click(screen.getByRole("button"));
  expect(document.documentElement).not.toHaveClass("dark");
});
