import { expect, it } from "vitest";
import { avgUsd, usd } from "./helpers";
it.each([NaN, Infinity, -Infinity])("hides non-finite average %s", (value) =>
  expect(avgUsd(value)).toBe("—"),
);
it.each([
  [0, "$0.000"],
  [0.00001, "<$0.001"],
  [0.0025, "$0.003"],
  [0.0123, "$0.012"],
  [1, "$1.000"],
] as const)("formats average %s", (value, label) =>
  expect(avgUsd(value)).toBe(label),
);
it.each([
  [0, "$0.00"],
  [0.072, "$0.07"],
  [14.254, "$14.25"],
] as const)("formats totals %s to 2 decimals", (value, label) =>
  expect(usd(value)).toBe(label),
);
