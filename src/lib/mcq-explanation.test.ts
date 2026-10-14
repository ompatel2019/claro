import { expect, it } from "vitest";
import { readMcqExplanation } from "./mcq-explanation";
const explanation = {
  concept: " A local content rule sets a minimum domestic share. ",
  why_correct: "It reduces imported inputs.",
  distractors: {
    A: "Not a tariff.",
    B: "Not an export subsidy.",
    D: "Not a quota.",
  },
};
it("reads structured objects and JSON text, trimming paragraphs", () => {
  const expected = { ...explanation, concept: explanation.concept.trim() };
  expect(readMcqExplanation(explanation)).toEqual(expected);
  expect(readMcqExplanation(JSON.stringify(explanation))).toEqual(expected);
});
it.each([
  null,
  undefined,
  "Plain legacy prose.",
  "{broken",
  "null",
  [],
  {},
  { ...explanation, concept: " " },
  { ...explanation, why_correct: 1 },
  { ...explanation, distractors: { A: null } },
])("rejects malformed structured content safely: %j", (value) => {
  expect(readMcqExplanation(value)).toBeNull();
});
it("accepts partial distractors without inventing notes", () => {
  expect(
    readMcqExplanation({ ...explanation, distractors: {} })?.distractors,
  ).toEqual({});
});
