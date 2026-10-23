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
  window.history.replaceState({}, "", "/");
  delete document.documentElement.dataset.themeDir;
  localStorage.clear();
  setTheme("system");
});
afterEach(() => {
  cleanup();
  delete (document as Partial<Document>).startViewTransition;
  delete (document.documentElement as Partial<HTMLElement>).animate;
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

it("reveals the next theme around the button with view transitions", async () => {
  const animate = vi.fn();
  const start = vi.fn((apply: () => void) => {
    apply();
    return { ready: Promise.resolve() };
  });
  vi.stubGlobal("matchMedia", () =>
    Object.assign(new EventTarget(), { matches: false }),
  );
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: start,
  });
  Object.defineProperty(document.documentElement, "animate", {
    configurable: true,
    value: animate,
  });
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button"));
  expect(start).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.themeDir).toBe("to-dark");
  await act(async () => {});
  expect(animate).toHaveBeenCalledWith(
    expect.objectContaining({ clipPath: expect.any(Array) }),
    expect.objectContaining({
      duration: 560,
      pseudoElement: "::view-transition-new(root)",
    }),
  );
  fireEvent.click(screen.getByRole("button"));
  await act(async () => {});
  expect(document.documentElement.dataset.themeDir).toBe("to-light");
  expect(animate).toHaveBeenCalledWith(
    expect.objectContaining({ clipPath: expect.any(Array) }),
    expect.objectContaining({ pseudoElement: "::view-transition-old(root)" }),
  );
});

it("blips opacity when view transitions are unavailable", () => {
  const animate = vi.fn();
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(document.documentElement, "animate", {
    configurable: true,
    value: animate,
  });
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button"));
  expect(animate).toHaveBeenCalledWith(
    [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }],
    { duration: 320, easing: "ease" },
  );
  expect(document.documentElement).toHaveClass("dark");
});

it.each(["reduced motion", "parity"])("swaps instantly under %s", (mode) => {
  const start = vi.fn(),
    animate = vi.fn();
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: start,
  });
  Object.defineProperty(document.documentElement, "animate", {
    configurable: true,
    value: animate,
  });
  vi.stubGlobal("matchMedia", (query: string) =>
    Object.assign(new EventTarget(), {
      matches: mode === "reduced motion" && query.includes("reduced-motion"),
    }),
  );
  if (mode === "parity") window.history.replaceState({}, "", "/?parity");
  render(<ThemeToggle />);
  const button = screen.getByRole("button");
  fireEvent.click(button);
  expect(document.documentElement).toHaveClass("dark");
  expect(start).not.toHaveBeenCalled();
  expect(animate).not.toHaveBeenCalled();
  expect(button).not.toHaveClass("is-spring");
});
