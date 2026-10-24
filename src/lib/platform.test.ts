import { describe, expect, it } from "vitest";
import { modKeyFor } from "./platform";

describe("modKeyFor", () => {
  it("shows ⌘ on Apple platforms", () => {
    for (const p of ["MacIntel", "macOS", "iPhone", "iPad"])
      expect(modKeyFor(p)).toBe("⌘");
  });
  it("shows Ctrl elsewhere", () => {
    for (const p of ["Win32", "Windows", "Linux x86_64", "Chrome OS"])
      expect(modKeyFor(p)).toBe("Ctrl");
  });
  it("shows both when the platform is unknown", () => {
    expect(modKeyFor(undefined)).toBe("⌘/Ctrl");
    expect(modKeyFor("")).toBe("⌘/Ctrl");
  });
});
