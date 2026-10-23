import { expect, it } from "vitest";
import { normaliseStem } from "./stem-text";

it.each([
  ["", ""],
  ["  \r\n  ", ""],
  [
    "  Explain the policy used by  \n government to limit pollution.  ",
    "Explain the policy used by government to limit pollution.",
  ],
  [
    "Explain the policy\r\nused by government.\r\n\r\nDiscuss its effects.  ",
    "Explain the policy used by government.\n\nDiscuss its effects.",
  ],
  [
    "First paragraph\ncontinued.\n  \nSecond paragraph\ncontinued.",
    "First paragraph continued.\n  \nSecond paragraph continued.",
  ],
  ["Explain market-  \nbased policies.", "Explain market-based policies."],
  [
    "Explain a policy -\nthen evaluate it.",
    "Explain a policy - then evaluate it.",
  ],
  ["Compare 1-\n2 policies.", "Compare 1- 2 policies."],
  ["Explain market-\n\nbased policies.", "Explain market-\n\nbased policies."],
  ["Explain the policy.\n", "Explain the policy."],
])("normalises prose %j", (input, expected) => {
  expect(normaliseStem(input)).toBe(expected);
});

it.each([
  "•",
  "-",
  "*",
  "(a)",
  "a)",
  "a.",
  "i.",
  "(iv)",
  "iv)",
  "1.",
  "1)",
  "(12)",
])("preserves %s list boundaries and joins wrapped item text", (marker) => {
  expect(
    normaliseStem(
      `Discuss:\n${marker} First item\ncontinued here.\n${marker} Second item.`,
    ),
  ).toBe(
    `Discuss:\n${marker} First item continued here.\n${marker} Second item.`,
  );
});

it.each([
  "Year | GDP\n2023 | 2%",
  "| Year | GDP |\n| --- | --- |\n| 2023 | 2% |",
  "Year\tGDP\n2023\t2%  ",
  "  Year    GDP\n  2023    2%  ",
  "Year GDP\n2023 2%\n2024 3%",
  "Explain the data:\nSource: ABS\nNational accounts, 2024  ",
  "Year\tGDP\r\n2023\t2%",
])("preserves structural blocks %j", (input) => {
  expect(normaliseStem(input)).toBe(input.replace(/\r\n/g, "\n"));
});

it("normalises prose around a table without changing its block", () => {
  const table = "Year    GDP\n2023    2%  ";
  expect(
    normaliseStem(
      `Use the following\ndata.\n\n${table}\n\nExplain the\nchange.`,
    ),
  ).toBe(`Use the following data.\n\n${table}\n\nExplain the change.`);
});

it("is idempotent", () => {
  const input =
    "Discuss market-\nbased policies:\n(a) First policy\nand effects.\n(b) Second policy.\n\nSource: ABS\n2024 data";
  const result = normaliseStem(input);
  expect(normaliseStem(result)).toBe(result);
});
