import Link from "next/link";
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
  AnnotatedFeedback: ({
    row,
    aiNote = true,
    flush = false,
  }: {
    row: ReviewRow;
    aiNote?: boolean;
    flush?: boolean;
  }) => (
    <p>
      Written feedback: {row.status}
      {aiNote && " (with AI line)"}
      {flush && " (flush)"}
    </p>
  ),
}));
vi.mock("./session-shell", () => ({ isTyping: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);
it("renders stored feedback and next steps", () => {
  render(
    <OverallFeedback
      summary={{
        strengths: ["Precise definitions"],
        improvements: ["Add a causal link"],
        next_steps: ["Review inflation"],
      }}
      pending={false}
    />,
  );
  expect(screen.getByText("Precise definitions")).toBeVisible();
  expect(screen.getByText("Add a causal link")).toBeVisible();
  expect(screen.getByText("Review inflation")).toBeVisible();
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
      "text-destructive",
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

it("puts stored next steps before strengths and fixes", () => {
  render(
    <>
      <OverallFeedback
        pending={false}
        summary={{ strengths: ["Stored advice"], top_fixes: ["Stored fix"] }}
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
});

it("keeps the supplied next step available while a summary is pending", () => {
  render(
    <OverallFeedback
      summary={null}
      pending
      nextStep={<Link href="/student/sprint?sub=topic">Practise</Link>}
    />,
  );
  expect(screen.getByRole("link", { name: "Practise" })).toHaveAttribute(
    "href",
    "/student/sprint?sub=topic",
  );
  expect(screen.getByRole("status")).toBeVisible();
});

it("keeps question jump links and semantic strength/fix icons in the summary", () => {
  render(
    <OverallFeedback
      pending={false}
      summary={{
        strengths: ["At Q3, define inflation."],
        top_fixes: ["At Q2, explain supply."],
      }}
    />,
  );
  expect(screen.getByRole("link", { name: "Q3" })).toHaveAttribute(
    "href",
    "#q-3",
  );
  expect(screen.getByRole("link", { name: "Q2" })).toHaveAttribute(
    "href",
    "#q-2",
  );
  for (const [name, colour] of [
    ["Strengths", "success"],
    ["Top fixes", "destructive"],
  ]) {
    const heading = screen.getByRole("heading", { name });
    expect(heading).toHaveClass(`text-${colour}`);
    expect(heading.querySelector("svg")).toBeTruthy();
    expect(heading.closest("section")?.querySelector("li svg")).toHaveClass(
      `text-${colour}`,
    );
  }
});

it("keeps unanswered MC rows distinct from incorrect answers in sprint tiles and Table view", () => {
  const rows = [null, 0].map((choice_index, i) => ({
    attempt_id: `mc-${i}`,
    position: i + 1,
    question_id: null,
    type: "mcq",
    marks: 1,
    max_marks: 1,
    mark: 0,
    status: "marked",
    feedback: null,
    choice_index,
    correct_index: 1,
    options: ["One", "Two"],
    stem: "Choose an answer.",
    source: "Practice",
    topic_id: null,
    review: null,
  })) as ReviewRow[];
  render(
    <ResultsAnswers
      sprintLayout
      rows={rows}
      id="sprint"
      name={() => ""}
      photos={new Map()}
    />,
  );
  const unanswered = screen.getByRole("button", {
    name: "Question 1, 0/1 marks, Not answered",
  });
  expect(unanswered).toHaveTextContent("Not answered");
  expect(unanswered).not.toHaveTextContent("Missed");
  expect(unanswered.querySelector("svg")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Question 2, 0/1 marks" }),
  ).toHaveTextContent("Missed");
  fireEvent.click(screen.getByRole("button", { name: "Table view" }));
  const table = screen.getByRole("table", { name: "Questions" });
  const unansweredRow = table.querySelectorAll("tbody tr")[0];
  expect(unansweredRow).toHaveTextContent("Not answered");
  expect(unansweredRow).not.toHaveTextContent("Missed");
  expect(unansweredRow.querySelector("svg")).toBeTruthy();
  expect(table.querySelectorAll("tbody tr")[1]).toHaveTextContent("Missed");
});

it("shows the AI line once under all questions, not under each written answer", () => {
  const row = (position: number, type: ReviewRow["type"]): ReviewRow =>
    ({
      attempt_id: String(position),
      position,
      question_id: null,
      type,
      marks: 4,
      max_marks: 4,
      mark: 2,
      status: "marked",
      check_status: "skipped",
      feedback: null,
      stem: `Stem ${position}`,
      stimulus: null,
      options: type === "mcq" ? ["One", "Two"] : null,
      choice_index: type === "mcq" ? 0 : null,
      correct_index: 0,
      source: "HSC",
      topic_id: null,
      explanation: null,
      image_paths: [],
      review: null,
      year: null,
      answer_text: type === "mcq" ? null : "Demand rose.",
      transcript: null,
      flagged: false,
      band: null,
      criteria: null,
      sample_answer: null,
    }) as ReviewRow;
  const { rerender } = render(
    <ResultsAnswers
      rows={[row(1, "short"), row(2, "short")]}
      id="sit"
      name={() => ""}
      photos={new Map()}
    />,
  );
  expect(screen.queryByText(/with AI line/)).not.toBeInTheDocument();
  // Inside the question card the marked answer draws no frame of its own.
  expect(screen.getByText(/Written feedback/)).toHaveTextContent("(flush)");
  expect(screen.getAllByText(/AI-assisted and criteria-based/)).toHaveLength(1);
  rerender(
    <ResultsAnswers
      rows={[row(1, "mcq")]}
      id="sit"
      name={() => ""}
      photos={new Map()}
    />,
  );
  expect(
    screen.queryByText(/AI-assisted and criteria-based/),
  ).not.toBeInTheDocument();
});
