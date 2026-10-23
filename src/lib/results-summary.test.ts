import { describe, expect, it } from "vitest";
import { isMetaLine, questionRefs, summaryView } from "./results-summary";

describe("isMetaLine", () => {
  it.each([
    "This summary covers your written short answers; multiple-choice (MC) answers were not supplied, so it makes no claims about your MC performance.",
    "Multiple-choice answers were not included in this feedback.",
    "As an AI, I can only see your written answers.",
    "As a language model, I cannot see your diagrams.",
    "The feedback only covers written answers.",
    "Your MC answers were not provided.",
  ])("drops %s", (line) => expect(isMetaLine(line)).toBe(true));

  it.each([
    "You label examples precisely in Q1.",
    "In Q2, you give the real GDP formula but do not calculate a value.",
    "Explain how increased import supply puts downward pressure on price in Q3.",
    "Your summary of the policy in Q4 is clear.",
    "You supplied two relevant examples in Q5.",
    "Q6 covers multiple-choice style recall well.",
    "In Q2, units were not included.",
    "In Q2, explain how firms use ChatGPT as an AI tool to improve labour productivity.",
    "In Q2, explain how a language model can raise labour productivity.",
    "The summary in Q1 covers both causes of inflation accurately.",
    "In Q2, your answer makes no claim about the effect on employment.",
    "Your multiple-choice answers were accurate.",
    "The feedback on Q3 identifies a tariff-revenue point as inaccurate.",
  ])("keeps %s", (line) => expect(isMetaLine(line)).toBe(false));
});

describe("summaryView", () => {
  it("drops meta lines and caps strengths and fixes at three", () => {
    expect(
      summaryView({
        strengths: [
          "This summary covers your written short answers; multiple-choice (MC) answers were not supplied, so it makes no claims about your MC performance.",
          "S1 in Q1.",
          "S2 in Q4.",
          "S3 in Q5.",
          "S4 in Q3.",
        ],
        top_fixes: ["F1 in Q2.", "F2 in Q3.", "F3 in Q3.", "F4 in Q6."],
      }),
    ).toEqual({
      strengths: ["S1 in Q1.", "S2 in Q4.", "S3 in Q5."],
      fixes: ["F1 in Q2.", "F2 in Q3.", "F3 in Q3."],
    });
  });

  it("prefers top_fixes over improvements and ignores non-strings", () => {
    expect(
      summaryView({
        top_fixes: ["A"],
        improvements: ["B"],
        strengths: [1, null, " ", "Kept"] as unknown as string[],
      }),
    ).toEqual({ strengths: ["Kept"], fixes: ["A"] });
    expect(summaryView({ improvements: ["B"] }).fixes).toEqual(["B"]);
  });

  it("handles a missing summary", () => {
    expect(summaryView(null)).toEqual({ strengths: [], fixes: [] });
  });
});

it("reads the cited questions in order without repeats", () => {
  expect(questionRefs("Q4 and Q5: Q5 links hours")).toEqual([4, 5]);
  expect(questionRefs("Compare Q12 with Q3")).toEqual([12, 3]);
  expect(questionRefs("No question, SQ3L")).toEqual([]);
});
