export type ThemePreference = "light" | "dark" | "system";
export const THEME_KEY = "claro-theme";

export function resolveTheme(preference: string | null, systemDark: boolean) {
  return preference === "dark" || (preference !== "light" && systemDark);
}

export function readTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private browsers may block storage. System preference still works.
  }
  return "system";
}

// A synchronous head script applies the class before the body can paint.
export const themeScript = `(()=>{let p=null;try{p=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch{}document.documentElement.classList.toggle("dark",(${resolveTheme.toString()})(p,matchMedia("(prefers-color-scheme: dark)").matches))})()`;
