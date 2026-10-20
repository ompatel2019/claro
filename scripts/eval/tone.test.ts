// @vitest-environment node
import { expect, it } from "vitest";
import {
  STOCK_PHRASES,
  stockPhraseRate,
  secondPersonRate,
  thirdPersonRate,
  summariseTone,
} from "./tone";

it("counts stock phrases once per comment, ignoring case and whitespace", () => {
  expect(
    stockPhraseRate([
      "OVERALL, well done. This demonstrates understanding.",
      "The\n response is clear.",
      "Your overallocation calculation works.",
      "You explained the link.",
    ]),
  ).toBe(0.5);
  for (const phrase of STOCK_PHRASES) expect(stockPhraseRate([phrase])).toBe(1);
  expect(stockPhraseRate(["Try again."], ["try"])).toBe(1);
  expect(stockPhraseRate(["Use a figure."], ["", "a figure."])).toBe(1);
});

it("recognises you/your and sentence-start imperatives", () => {
  expect(
    secondPersonRate([
      "You explain this clearly.",
      "Your link is clear.",
      "Try adding the mechanism.",
      "A useful start. Please explain why spending falls.",
      "Good point! Link it to output.",
      "Youth unemployment is high.",
      "The figures show a fall.",
      "Trying to explain the effect is useful.",
    ]),
  ).toBe(5 / 8);
  expect(
    secondPersonRate(["You're clear here.", "You’ve named the effect."]),
  ).toBe(1);
});

it("counts third-person references with word boundaries", () => {
  expect(
    thirdPersonRate([
      "The STUDENT explains the link. The response is clear.",
      "The\nresponse needs detail.",
      "You explain the link.",
      "The students explain the responses.",
    ]),
  ).toBe(0.5);
});

it("allows tone rates to overlap", () => {
  expect(summariseTone([{ feedback: "Consider adding a figure." }])).toEqual({
    n: 1,
    stockPhraseRate: 1,
    secondPersonRate: 1,
    thirdPersonRate: 0,
  });
});

it("returns null rates when there are no non-empty comments", () => {
  for (const metric of [stockPhraseRate, secondPersonRate, thirdPersonRate]) {
    expect(metric([])).toBeNull();
    expect(metric(["", " \n "])).toBeNull();
  }
  expect(summariseTone([])).toEqual({
    n: 0,
    stockPhraseRate: null,
    secondPersonRate: null,
    thirdPersonRate: null,
  });
});

it("pools structured comments and advice without double-counting feedback", () => {
  expect(
    summariseTone([
      {
        feedbackComments: [
          { body: "Clear mechanism", next_mark: "Explain the effect." },
          { body: "You link costs to prices.", next_mark: null },
        ],
        feedback: "Overall, the student does well.",
      },
      { feedback: "The response needs detail." },
      { feedbackComments: [], feedback: "You name the factor." },
      { feedback: null },
      { feedback: "  " },
      { flags: { excluded: "Fixture bug" }, feedback: "Overall, well done." },
    ]),
  ).toEqual({
    n: 4,
    stockPhraseRate: 1 / 4,
    secondPersonRate: 3 / 4,
    thirdPersonRate: 1 / 4,
  });
});

it("extracts legacy rendered comments without scoring quotes or other feedback", () => {
  expect(
    summariseTone([
      {
        feedback: [
          "Overall, the student has some knowledge.",
          '1. [Strength · Analysis] "the response" — You link costs to prices.',
          '2. [Fix · Evidence] "you — the student" — A figure is missing. Next mark: Add a dated figure.',
          "Next band: Consider more detail.",
          "Why not higher: The response is brief.",
          "Better-answer outline:",
          "- Explain inflation.",
        ].join("\n"),
      },
    ]),
  ).toEqual({
    n: 2,
    stockPhraseRate: 0,
    secondPersonRate: 1,
    thirdPersonRate: 0,
  });
});
