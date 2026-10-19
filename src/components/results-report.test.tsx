import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OverallFeedback, ResultsAnswers } from "./results-report";
import type { ReviewRow } from "@/lib/feedback";
vi.mock("./feedback-widget", () => ({
  ReportProblem: () => <button>Report a problem</button>,
}));
vi.mock("./question-mark", () => ({
  QuestionMark: () => <button>Question this mark</button>,
}));
vi.mock("./annotated-feedback", () => ({
  AnnotatedFeedback: ({ row }: { row: ReviewRow }) => (
    <p>Written feedback: {row.status}</p>
  ),
}));
vi.mock("./session-shell", () => ({ isTyping: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);
it("renders stored feedback and deterministic next-step links", () => {
  render(
    <OverallFeedback
      summary={{
        strengths: ["Precise definitions"],
        improvements: ["Add a causal link"],
        next_steps: ["Review inflation"],
      }}
      pending={false}
      actions={[
        {
          label: "Practise Inflation questions",
          href: "/student/sprint?sub=inflation",
        },
      ]}
    />,
  );
  expect(screen.getByText("Precise definitions")).toBeVisible();
  expect(screen.getByText("Add a causal link")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Practise Inflation questions" }),
  ).toHaveAttribute("href", "/student/sprint?sub=inflation");
});
it("renders top fixes and pending summary skeletons", () => {
  const { rerender } = render(
    <OverallFeedback
      summary={{ top_fixes: ["Use evidence"] }}
      pending={false}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Overall feedback" }),
  ).toBeVisible();
  expect(screen.getByText("Use evidence")).toBeVisible();
  rerender(<OverallFeedback summary={null} pending />);
  expect(screen.getByRole("status")).toHaveTextContent("once marking finishes");
  expect(screen.queryByText(/isn’t available/)).not.toBeInTheDocument();
});
it("reuses the MC review and selects the first lost-mark question with original numbering", () => {
  const row = (position: number, mark: number): ReviewRow =>
    ({
      attempt_id: String(position),
      position,
      question_id: null,
      type: "mcq",
      marks: 1,
      max_marks: 1,
      mark,
      status: "marked",
      check_status: "skipped",
      feedback: null,
      stem: `Stem ${position}`,
      stimulus: null,
      options: ["One", "Two"],
      choice_index: 0,
      correct_index: mark ? 0 : 1,
      source: "HSC",
      topic_id: null,
      explanation: "Explanation",
      image_paths: [],
      review: null,
      year: null,
      answer_text: null,
      transcript: null,
      flagged: false,
      band: null,
      criteria: null,
      sample_answer: null,
    }) as ReviewRow;
  render(
    <ResultsAnswers
      rows={[row(1, 1), row(24, 0)]}
      id="sit"
      name={() => ""}
      photos={new Map()}
    />,
  );
  expect(screen.getByText("Question 24")).toBeVisible();
  expect(screen.getByText("Stem 24")).toBeVisible();
  expect(screen.getByText(/Your answer: A/)).toBeVisible();
  expect(
    screen.getByText("Explanation", { selector: "summary" }),
  ).toBeVisible();
});

it("uses a real heading and sprint unavailable copy without skeletons", () => {
  const { container } = render(
    <OverallFeedback summary={null} pending={false} />,
  );
  expect(
    screen.getByRole("heading", { level: 2, name: "Overall feedback" }),
  ).toBeVisible();
  expect(screen.getByText(/isn’t available for this sprint/)).toBeVisible();
  expect(container.querySelector(".animate-pulse")).toBeNull();
});

it.each([
  {
    strengths: ["Across both answers, you define terms before using them."],
    improvements: ["Connect your paragraphs with a cause-and-effect link."],
    next_steps: ["Rewrite two topic sentences to answer the directive verb."],
  },
  {
    strengths: ["In this answer, you define terms clearly."],
    improvements: [],
    next_steps: [],
  },
  {
    strengths: [],
    improvements: [],
    next_steps: [
      "There is not enough writing to assess habits. Try a short written answer.",
    ],
  },
  {
    strengths: ["Legacy strength"],
    top_fixes: ["Legacy fix"],
    next_steps: ["Legacy practice"],
  },
])(
  "renders writing-pattern summaries and sparse or legacy lists faithfully: %j",
  (summary) => {
    render(<OverallFeedback summary={summary} pending={false} />);
    for (const label of ["Strengths", "Top fixes", "Next steps"])
      expect(screen.getByRole("heading", { name: label })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Top fixes" })).toHaveClass(
      "text-warning-text",
    );
    for (const line of Object.values(summary).flat())
      expect(screen.getByText(line)).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  },
);

it.each([
  [{ confidence: "low" }, "Needs review"],
  [{}, "No mark available"],
])("labels terminal unscored results instead of Pending", (feedback, label) => {
  const row: ReviewRow = {
    attempt_id: "unmarkable",
    position: 1,
    question_id: null,
    type: "short",
    marks: 6,
    max_marks: 6,
    mark: null,
    status: "marked",
    check_status: "skipped",
    feedback,
    stem: "Explain inflation.",
    source: "Own question",
    topic_id: null,
    image_paths: [],
    review: null,
    stimulus: null,
    options: null,
    year: null,
    choice_index: null,
    correct_index: null,
    answer_text: null,
    transcript: null,
    flagged: false,
    band: null,
    criteria: null,
    sample_answer: null,
    explanation: null,
  };
  render(
    <ResultsAnswers
      rows={[row]}
      id="single"
      name={() => ""}
      photos={new Map()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table view" }));
  expect(screen.getByRole("table", { name: "Questions" })).toHaveTextContent(
    label,
  );
  expect(screen.queryByText("Pending")).not.toBeInTheDocument();
});

it("puts next steps first and links factual question chips without attributing AI text", () => {
  const row = (
    position: number,
    mark: number,
    type: ReviewRow["type"],
    status = "marked",
  ) =>
    ({
      position,
      mark,
      marks: 4,
      max_marks: 4,
      type,
      status,
      feedback: {},
    }) as ReviewRow;
  render(
    <>
      <OverallFeedback
        pending={false}
        summary={{ strengths: ["Stored advice"], top_fixes: ["Stored fix"] }}
        rows={[
          row(1, 4, "mcq"),
          row(7, 2, "short"),
          row(8, 0, "short", "failed"),
        ]}
        actions={[
          { label: "Retry mistakes", href: "/student/sprint?history=mistakes" },
        ]}
      />
      <ResultsAnswers rows={[]} id="test" name={() => ""} photos={new Map()} />
    </>,
  );
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
    "Overall feedback",
    "Your next step",
    "Next steps",
    "Strengths and fixes",
    "Strengths",
    "Top fixes",
  ]);
  expect(
    screen.getByRole("link", { name: "Q1 · Multiple choice" }),
  ).toHaveAttribute("href", "#q-1");
  expect(
    screen.getByRole("link", { name: "Q7 · Short answer" }),
  ).toHaveAttribute("href", "#q-7");
  expect(screen.queryByRole("link", { name: /Q8/ })).toBeNull();
});
it("keeps next-step actions available while a summary is pending", () => {
  render(
    <OverallFeedback
      summary={null}
      pending
      actions={[{ label: "Practise", href: "/student/sprint?sub=topic" }]}
    />,
  );
  expect(screen.getByRole("region", { name: "Next steps" })).toContainElement(
    screen.getByRole("link", { name: "Practise" }),
  );
});
