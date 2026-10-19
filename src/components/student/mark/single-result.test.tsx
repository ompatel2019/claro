import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReviewRow } from "@/lib/feedback";
import { SingleResult } from "./single-result";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/feedback-widget", () => ({ useFeedback: () => vi.fn() }));
afterEach(cleanup);
const row = {
  attempt_id: "answer",
  question_id: "question",
  stem: "Explain a change.",
  type: "short",
  topic_id: "growth",
  marks: 4,
  max_marks: 4,
  mark: 3,
  status: "marked",
  check_status: "agreed",
  answer_text: "Demand falls.",
  transcript: null,
  band: "2-3",
  criteria: [
    { min: 4, max: 4, descriptor: "Clear links with evidence." },
    { min: 2, max: 3, descriptor: "Partly developed links." },
  ],
  feedback: {
    comments: [
      {
        start: 0,
        quote: "Demand",
        kind: "strength",
        body: "Identifies demand.",
      },
      {
        start: 100,
        quote: "mismatched",
        kind: "fix",
        body: "Include evidence.",
        next_mark: "Use a statistic.",
      },
    ],
  },
} as unknown as ReviewRow;
it("derives the matched criteria, annotations and rewrite destination from the attempt", () => {
  render(
    <SingleResult
      row={row}
      sessionId="session"
      when="2026-10-19T00:00:00Z"
      topic="Economic growth"
    />,
  );
  expect(screen.getByRole("img", { name: "3 out of 4" })).toBeVisible();
  expect(screen.getByText("Your band").closest("li")).toHaveTextContent(
    "Partly developed links.",
  );
  expect(screen.getByText("Provisional")).toBeVisible();
  expect(screen.getByRole("link", { name: "Rewrite answer" })).toHaveAttribute(
    "href",
    "/student/mark?question=question",
  );
  expect(
    screen.getByRole("list", { name: "Examiner notes" }),
  ).toHaveTextContent("Identifies demand.");
  const note = screen.getByText("Identifies demand.").closest("li")!;
  fireEvent.focus(note);
  expect(screen.getByText("Demand")).toHaveClass("bg-brand-soft");
  fireEvent.blur(note);
  expect(screen.getByText("Demand")).not.toHaveClass("bg-brand-soft");
  expect(screen.getByText("Add evidence")).toBeVisible();
  expect(screen.getByText("Use a statistic.")).toBeVisible();
});
it("distinguishes a reviewed full mark from provisional feedback", () => {
  render(
    <SingleResult
      row={{ ...row, mark: 4, check_status: "reviewed", feedback: null }}
      sessionId="session"
      when="2026-10-19T00:00:00Z"
      topic="Economic growth"
    />,
  );
  expect(screen.queryByText("Provisional")).not.toBeInTheDocument();
  expect(screen.getByText("Reviewed")).toBeVisible();
  expect(screen.getByText("Full marks")).toBeVisible();
  expect(screen.getByText("Your band").closest("li")).toHaveTextContent(
    "Clear links with evidence.",
  );
});

it("keeps explanations and disputes inside the final card's More disclosure", () => {
  render(
    <SingleResult
      row={{ ...row, explanation: "Rate changes affect demand." }}
      sessionId="session"
      when="2026-10-19T00:00:00Z"
      topic="Economic growth"
    />,
  );
  const more = screen.getByText("More").closest("details")!;
  expect(more.closest('[data-slot="card"]')).toHaveTextContent(
    "Your answer, marked",
  );
  expect(more).toHaveTextContent("Explanation");
  expect(more).toHaveTextContent("Marking review");
  fireEvent.click(screen.getByText("More"));
  fireEvent.click(screen.getByText("Marking review"));
  expect(
    screen.getByRole("button", { name: "Question this mark" }),
  ).toBeVisible();
});
