import { expect, it } from "vitest";
import { avgUsd } from "./helpers";
it.each([NaN, Infinity, -Infinity])("hides non-finite average %s", (value) =>
  expect(avgUsd(value)).toBe("—"),
);
it.each([
  [0, "$0.0000"],
  [0.00001, "<$0.0001"],
  [0.0025, "$0.0025"],
  [1, "$1.00"],
] as const)("formats average %s", (value, label) =>
  expect(avgUsd(value)).toBe(label),
);
