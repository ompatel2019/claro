import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { McqExplanationView } from "./mcq-explanation";
import { McReview } from "./mc-review";
import type { ReviewRow } from "@/lib/feedback";
const explanation = {
  concept: "A local content rule sets a minimum domestic share.",
  why_correct: "It reduces imported inputs.",
  distractors: {
    D: "Not a quota.",
    B: "Not an export subsidy.",
    A: "Not a tariff.",
    C: "Do not show the key as a distractor.",
  },
};
afterEach(cleanup);
it("renders the concept, conclusion, reasoning and distractors in order", () => {
  const { container } = render(
    <McqExplanationView
      explanation={JSON.stringify(explanation)}
      correctIndex={2}
    />,
  );
  const text = container.textContent!;
  expect(screen.getByText(explanation.concept)).toBeVisible();
  expect(text.indexOf("A local content rule")).toBeLessThan(
    text.indexOf("Thus the answer is C."),
  );
  expect(text.indexOf("Thus the answer is C.")).toBeLessThan(
    text.indexOf("It reduces imported inputs."),
  );
  expect(text.indexOf("It reduces imported inputs.")).toBeLessThan(
    text.indexOf("Not a tariff."),
  );
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "A.Not a tariff.",
    "B.Not an export subsidy.",
    "D.Not a quota.",
  ]);
  expect(screen.queryByText(explanation.distractors.C)).not.toBeInTheDocument();
});
it.each(["Legacy **explanation**.", '{"concept": "incomplete"}'])(
  "preserves legacy or malformed text: %s",
  (text) => {
    const { container } = render(
      <McqExplanationView explanation={text} correctIndex={0} />,
    );
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.queryByText(/Thus the answer/)).not.toBeInTheDocument();
  },
);
it("does not invent a key or an empty option section", () => {
  render(
    <McqExplanationView explanation={{ ...explanation, distractors: {} }} />,
  );
  expect(screen.getByText("It reduces imported inputs.")).toBeVisible();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  expect(screen.queryByText(/Thus the answer/)).not.toBeInTheDocument();
});
it.each([0, 2, null])(
  "results use the same explanation for choice %s",
  (choice) => {
    const { container } = render(
      <McReview
        row={
          {
            choice_index: choice,
            correct_index: 2,
            options: ["A", "B", "C", "D"],
            explanation: JSON.stringify(explanation),
          } as ReviewRow
        }
      />,
    );
    expect(container.querySelector("details")).toHaveProperty(
      "open",
      choice !== 2,
    );
    expect(screen.getByText("Thus the answer is C.")).toBeInTheDocument();
    if (choice === null)
      expect(screen.getByText(/Not answered · Correct: C/)).toBeVisible();
  },
);
