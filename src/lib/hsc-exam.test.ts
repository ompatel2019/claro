import { describe, expect, it } from "vitest";
import { examDaysLeft } from "./hsc-exam";

describe("examDaysLeft", () => {
  it("counts Sydney days to the exam", () => {
    expect(examDaysLeft("2026-10-19")).toBe(8);
    expect(examDaysLeft("2026-10-27")).toBe(0);
    expect(examDaysLeft("2026-10-28")).toBeNull();
  });
});
