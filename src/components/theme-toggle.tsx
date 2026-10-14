"use client";

import { useSyncExternalStore } from "react";
import {
  readTheme,
  resolveTheme,
  THEME_KEY,
  type ThemePreference,
} from "@/lib/theme";
import { Moon, Sun } from "@/components/icons";
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
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Dark mode"
      aria-pressed={dark}
      title="Toggle dark mode"
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Moon /> : <Sun />}
    </Button>
  );
}
