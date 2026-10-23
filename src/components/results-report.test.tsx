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
    for (const label of ["Strengths", "Fixes", "Next steps"])
      expect(screen.getByRole("heading", { name: label })).toBeVisible();
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
    "Fixes",
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

it("keeps one line per point with its question links on the right", () => {
  render(
    <OverallFeedback
      hideNextStep
      pending={false}
      summary={{
        strengths: ["At Q3, define inflation."],
        top_fixes: ["Q4 and Q5: link hours to output, as Q5 asks."],
      }}
    />,
  );
  expect(screen.getByRole("link", { name: "Go to Q3" })).toHaveAttribute(
    "href",
    "#q-3",
  );
  const fix = screen.getByText(/^Q4 and Q5: link hours/);
  expect(fix).toHaveClass(
    "sm:truncate",
    "sm:group-focus-within:whitespace-normal",
  );
  expect(fix).toHaveAttribute("title", fix.textContent);
  expect(
    Array.from(fix.closest("li")!.querySelectorAll("a"), (a) =>
      a.getAttribute("href"),
    ),
  ).toEqual(["#q-4", "#q-5"]);
  for (const name of ["Strengths", "Fixes"])
    expect(
      screen.getByRole("heading", { name }).querySelector("svg"),
    ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Your next step" }),
  ).not.toBeInTheDocument();
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
  expect(unanswered).toHaveTextContent("—");
  expect(unanswered.querySelector("svg")).toBeTruthy();
  // Q1 is open (the first lost mark), so its colour is brand-soft; Q2 shows dropped marks.
  expect(unanswered).toHaveAttribute("aria-current", "true");
  expect(
    screen.getByRole("button", { name: "Question 2, 0/1 marks" }),
  ).toHaveClass("bg-destructive-soft");
  fireEvent.click(screen.getByRole("button", { name: "Table view" }));
  const table = screen.getByRole("table", { name: "Questions" });
  const [unansweredRow, wrongRow] = table.querySelectorAll("tbody tr");
  expect(unansweredRow).toHaveTextContent("Not answered");
  expect(unansweredRow).not.toHaveTextContent("Marks dropped");
  expect(wrongRow).toHaveTextContent("Marks dropped");
});

it("builds the sprint question card: badges, full-marks answer, then the actions row", () => {
  const row = (position: number, mark: number): ReviewRow =>
    ({
      attempt_id: `w-${position}`,
      position,
      question_id: `q-${position}`,
      type: "short",
      marks: 2,
      max_marks: 2,
      mark,
      status: "marked",
      check_status: "skipped",
      feedback: null,
      stem: `Stem ${position}`,
      source: "Practice",
      topic_id: "growth",
      image_paths: [],
      review: null,
      answer_text: "Answer",
      sample_answer: "Real GDP = 840/105 x 100/1 = $800 m",
    }) as unknown as ReviewRow;
  const props = {
    sprintLayout: true,
    rows: [row(1, 2), row(2, 1)],
    id: "sprint",
    name: () => "Economic growth",
    photos: new Map(),
  };
  const { rerender } = render(<ResultsAnswers {...props} />);
  // Opens on the first question that lost marks.
  expect(screen.getByText("Stem 2")).toBeVisible();
  for (const badge of ["Question 2", "2 marks", "Economic growth"])
    expect(screen.getAllByText(badge)[0]).toBeVisible();
  const sample = screen.getByText("Full-marks answer").closest("details")!;
  expect(sample).not.toHaveAttribute("open");
  expect(sample).toHaveTextContent("Real GDP = 840 ÷ 105 × 100 = $800m");
  expect(
    screen.getByRole("link", { name: "Practise a similar question" }),
  ).toHaveAttribute("href", "/student/sprint?type=short&sub=growth");
  expect(
    screen.queryByRole("link", { name: /flashcards/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Question this mark" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Report a problem" }),
  ).toBeVisible();
  expect(
    screen.queryByText(/Think a written mark missed something/),
  ).not.toBeInTheDocument();
  rerender(<ResultsAnswers {...props} cards={{ growth: 4 }} />);
  expect(
    screen.getByRole("link", { name: "Economic growth flashcards" }),
  ).toHaveAttribute("href", "/student/flashcards?topic=growth");
  rerender(<ResultsAnswers {...props} readOnly />);
  expect(
    screen.queryByRole("link", { name: "Practise a similar question" }),
  ).not.toBeInTheDocument();
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

it("drops meta lines and caps strengths and fixes at three each", () => {
  render(
    <OverallFeedback
      hideNextStep
      pending={false}
      summary={{
        strengths: [
          "This summary covers your written short answers; multiple-choice (MC) answers were not supplied, so it makes no claims about your MC performance.",
          "S1 in Q1.",
          "S2 in Q4.",
          "S3 in Q5.",
          "S4 in Q3.",
        ],
        top_fixes: ["F1 in Q2.", "F2 in Q3.", "F3 in Q3.", "F4 in Q6."],
      }}
    />,
  );
  const items = screen
    .getAllByRole("listitem")
    .map((li) => li.querySelector("span")?.textContent);
  expect(items).toEqual([
    "S1 in Q1.",
    "S2 in Q4.",
    "S3 in Q5.",
    "F1 in Q2.",
    "F2 in Q3.",
    "F3 in Q3.",
  ]);
  expect(screen.getAllByRole("link", { name: "Go to Q3" })[0]).toHaveAttribute(
    "href",
    "#q-3",
  );
});

it("falls back to one plain line when a summary has no strengths or fixes", () => {
  const { rerender } = render(
    <OverallFeedback
      hideNextStep
      pending={false}
      summary={{
        strengths: [],
        improvements: [],
        next_steps: ["There is not enough writing to assess habits."],
      }}
    />,
  );
  expect(
    screen.getByText("There is not enough writing to assess habits."),
  ).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Fixes" })).toBeNull();
  rerender(
    <OverallFeedback
      hideNextStep
      pending={false}
      summary={{ strengths: ["Clear terms in Q1."], top_fixes: [] }}
    />,
  );
  expect(screen.getByText("Nothing to add this time.")).toBeVisible();
});
