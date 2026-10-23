import { expect, it } from "vitest";
import { formatSampleMaths } from "./sample-maths";

it.each([
  ["840/105 x 100/1 = $800 m", "840 ÷ 105 × 100 = $800m"],
  ["840 / 105 × 100 = $800m", "840 ÷ 105 × 100 = $800m"],
  ["Real GDP = 840/105 x 100 = 800", "Real GDP = 840 ÷ 105 × 100 = 800"],
  ["So 2*3 = 6.", "So 2 × 3 = 6."],
  ["105x100 = 10,500", "105 × 100 = 10,500"],
  ["1,200 - 200 = 1,000 bn", "1,200 − 200 = 1,000bn"],
  ["5% + 2% = 7%", "5% + 2% = 7%"],
  ["100/1% = 10000", "100 ÷ 1% = 10000"],
  ["Line one\n840/105 x 100/1 = $800 m", "Line one\n840 ÷ 105 × 100 = $800m"],
])("formats %j", (input, output) => {
  expect(formatSampleMaths(input)).toBe(output);
});

it.each([
  "Half (1/2) of firms cut hours.",
  "Released on 23/10/2026.",
  "Dated 1/2/2026 = the start of term",
  "See https://example.com/840/105 = page",
  "Prices rose 3% in 2025-26.",
  "The x axis shows 1/2 of output",
  "Unemployment fell to 4 x lower",
  "Period 2020 - 2021 saw growth.",
  "ratio a/b = c",
  "https://example.com/?calc=2*3=6",
  "See /resources?calc=2*3=6 for more",
  "See www.example.com/a#840/105=8 for more",
  "See (/resources?calc=2*3=6) for more",
  "See example.com/?calc=2*3=6 for more",
  "See /?calc=2*3=6 for more",
  "See /2024/calc?x=2*3=6 for more",
  "See example.com?calc=2*3=6 for more",
  'Open "/calc/840/105=8" to check',
])("leaves %j alone", (input) => {
  expect(formatSampleMaths(input)).toBe(input);
});

it("still formats maths that follows an opening bracket", () => {
  expect(formatSampleMaths("Real GDP (840/105 x 100 = 800)")).toBe(
    "Real GDP (840 ÷ 105 × 100 = 800)",
  );
});

it("never pulls a unit across a line break", () => {
  expect(formatSampleMaths("Total is 2*3 = 6\nm is the multiplier.")).toBe(
    "Total is 2 × 3 = 6\nm is the multiplier.",
  );
  expect(formatSampleMaths("840/105 x 100 = 800 m.")).toBe(
    "840 ÷ 105 × 100 = 800m.",
  );
});

it("formats division with uneven slash spacing", () => {
  expect(formatSampleMaths("840 /105 x 100 = $800 m")).toBe(
    "840 ÷ 105 × 100 = $800m",
  );
});
