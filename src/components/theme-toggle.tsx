"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import {
  readTheme,
  resolveTheme,
  THEME_KEY,
  type ThemePreference,
} from "@/lib/theme";
import { Button } from "./ui/button";

let preference: ThemePreference | undefined;
const event = "claro-theme-change";

export function setTheme(value: ThemePreference) {
  preference = value;
  try {
    if (value === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, value);
  } catch {
    // Keep the choice for this page when storage is unavailable.
  }
  applyTheme();
}

function applyTheme() {
  document.documentElement.classList.toggle(
    "dark",
    resolveTheme(
      preference ?? readTheme(),
      matchMedia("(prefers-color-scheme: dark)").matches,
    ),
  );
  window.dispatchEvent(new Event(event));
}

function subscribe(notify: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const storage = (change: StorageEvent) => {
    if (change.key === THEME_KEY || change.key === null) {
      preference = undefined;
      applyTheme();
    }
  };
  window.addEventListener(event, notify);
  window.addEventListener("storage", storage);
  media.addEventListener("change", applyTheme);
  applyTheme();
  return () => {
    window.removeEventListener(event, notify);
    window.removeEventListener("storage", storage);
    media.removeEventListener("change", applyTheme);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    const root = document.documentElement;
    const next = dark ? "light" : "dark";
    const instant =
      new URLSearchParams(location.search).has("parity") ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.dataset.themeMotion = instant ? "instant" : "animated";
    const apply = () => flushSync(() => setTheme(next));
    if (instant) {
      apply();
      return;
    }
    root.dataset.themeDir = next === "dark" ? "to-dark" : "to-light";
    button.classList.remove("is-spring");
    void button.offsetWidth;
    button.classList.add("is-spring");
    if (!document.startViewTransition) {
      root.animate?.([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], {
        duration: 320,
        easing: "ease",
      });
      apply();
      return;
    }
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y),
    );
    const transition = document.startViewTransition(apply);
    void transition.ready
      .then(() => {
        const circle = (r: number) => `circle(${r}px at ${x}px ${y}px)`;
        const toDark = next === "dark";
        root.animate(
          {
            clipPath: toDark
              ? [circle(0), circle(radius)]
              : [circle(radius), circle(0)],
          },
          {
            duration: 560,
            easing: "cubic-bezier(.32,.72,0,1)",
            pseudoElement: toDark
              ? "::view-transition-new(root)"
              : "::view-transition-old(root)",
          },
        );
        root.animate(
          { opacity: toDark ? [1, 0] : [0, 1] },
          {
            duration: 560,
            easing: "ease",
            pseudoElement: toDark
              ? "::view-transition-old(root)"
              : "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {});
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="theme-toggle"
      aria-label="Dark mode"
      aria-pressed={dark}
      title="Toggle dark mode"
      onClick={toggle}
    >
      <svg
        className={`theme-glyph ${dark ? "is-moon" : "is-sun"}`}
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <g className="rays">
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </g>
        <circle className="core" cx="12" cy="12" r="4" />
        <path
          className="moon"
          d="M16.5 3.2A8.5 8.5 0 1 0 20.8 14 7 7 0 0 1 16.5 3.2Z"
        />
      </svg>
    </Button>
  );
}
