import { describe, expect, it } from "vitest";
import { isMetaLine, questionRef, summaryView } from "./results-summary";

describe("isMetaLine", () => {
  it.each([
    "This summary covers your written short answers; multiple-choice (MC) answers were not supplied, so it makes no claims about your MC performance.",
    "Multiple-choice answers were not included in this feedback.",
    "As an AI, I can only see your written answers.",
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
    "The summary in Q1 covers both causes of inflation accurately.",
    "In Q2, your answer makes no claim about the effect on employment.",
    "Your multiple-choice answers were accurate.",
    "The feedback on Q3 identifies a tariff-revenue point as inaccurate.",
  ])("keeps %s", (line) => expect(isMetaLine(line)).toBe(false));
});

describe("summaryView", () => {
  it("drops meta lines and caps strengths and fixes at three", () => {
    const view = summaryView({
      strengths: [
        "This summary covers your written short answers; multiple-choice (MC) answers were not supplied, so it makes no claims about your MC performance.",
        "S1 in Q1.",
        "S2 in Q4.",
        "S3 in Q5.",
        "S4 in Q3.",
      ],
      top_fixes: ["F1 in Q2.", "F2 in Q3.", "F3 in Q3.", "F4 in Q6."],
      next_steps: ["Rewrite the Q2 working with the table figures."],
    });
    expect(view.strengths).toEqual(["S1 in Q1.", "S2 in Q4.", "S3 in Q5."]);
    expect(view.fixes).toEqual(["F1 in Q2.", "F2 in Q3.", "F3 in Q3."]);
    expect(view.nextStep).toEqual({
      text: "Rewrite the Q2 working with the table figures.",
      question: 2,
    });
  });

  it("uses the first fix as the next step without repeating it", () => {
    const view = summaryView({
      improvements: ["In Q2, show the substitution.", "In Q3, link price."],
    });
    expect(view.nextStep).toEqual({
      text: "In Q2, show the substitution.",
      question: 2,
    });
    expect(view.fixes).toEqual(["In Q3, link price."]);
  });

  it("removes a fix that repeats the next step", () => {
    const view = summaryView({
      top_fixes: ["Do  X in Q2.", "Do Y in Q3."],
      next_steps: ["do x in Q2."],
    });
    expect(view.fixes).toEqual(["Do Y in Q3."]);
  });

  it("prefers top_fixes over improvements and ignores non-strings", () => {
    const view = summaryView({
      top_fixes: ["A"],
      improvements: ["B"],
      strengths: [1, null, " ", "Kept"] as unknown as string[],
      next_steps: ["Step"],
    });
    expect(view.fixes).toEqual(["A"]);
    expect(view.strengths).toEqual(["Kept"]);
    expect(view.nextStep).toEqual({ text: "Step", question: null });
  });

  it("can keep the next step in the fixes for pages without a next step", () => {
    const view = summaryView(
      { improvements: ["In Q2, show the substitution."] },
      { withoutStep: false },
    );
    expect(view.fixes).toEqual(["In Q2, show the substitution."]);
  });

  it("handles a missing summary", () => {
    expect(summaryView(null)).toEqual({
      strengths: [],
      fixes: [],
      nextStep: null,
    });
  });
});

describe("questionRef", () => {
  it("reads the first cited question", () => {
    expect(questionRef("Compare Q12 with Q3")).toBe(12);
    expect(questionRef("No question")).toBeNull();
    expect(questionRef("SQ3L")).toBeNull();
  });
});
