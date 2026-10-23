import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ReviewRow } from "@/lib/feedback";
import { ResultsNextStep } from "./results-next-step";

afterEach(cleanup);
const topics = [
  { id: "parent", name: "Economic issues", parent_id: null, sort: 1 },
  { id: "child", name: "Inflation", parent_id: "parent", sort: 2 },
  { id: "full", name: "Growth", parent_id: "parent", sort: 3 },
];
const row = (topic_id: string, mark: number, marks: number, position: number) =>
  ({
    topic_id,
    mark,
    marks,
    max_marks: marks,
    position,
    type: "short",
    status: "marked",
    feedback: {},
  }) as ReviewRow;
it("prioritises marks dropped, retains every topic and collapses full marks", () => {
  render(
    <ResultsNextStep
      rows={[
        row("child", 0, 1, 1),
        row("parent", 4, 10, 2),
        row("full", 4, 4, 3),
      ]}
      topics={topics}
      config={{ mode: "mixed", topics: [] }}
      cards={{ child: 2 }}
    />,
  );
  expect(screen.getByText(/Focus on Economic issues/)).toHaveTextContent(
    "6 marks dropped here",
  );
  expect(
    screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
  ).toEqual(["Economic issues", "Inflation"]);
  expect(screen.getByText("4/4 · Full marks")).toBeVisible();
  expect(
    screen
      .getAllByRole("link", { name: "Practise" })
      .map((a) => a.getAttribute("href")),
  ).toEqual([
    "/student/sprint?type=mixed&topics=parent",
    "/student/sprint?type=mixed&sub=child",
  ]);
  expect(screen.getByRole("link", { name: "Review cards" })).toHaveAttribute(
    "href",
    "/student/flashcards?topic=child",
  );
});
it("only shows full marks for a topic once every answer in it is scored", () => {
  render(
    <ResultsNextStep
      rows={[
        row("full", 4, 4, 1),
        { ...row("full", 0, 4, 2), mark: null, status: "failed" } as ReviewRow,
      ]}
      topics={topics}
      config={{ mode: "mixed", topics: [] }}
      cards={{}}
    />,
  );
  expect(screen.queryByText(/Full marks/)).toBeNull();
});
it("shows the real summary advice and an honest pending state", () => {
  const { rerender } = render(
    <ResultsNextStep
      rows={[]}
      topics={topics}
      config={{ mode: "mixed", topics: [] }}
      cards={{}}
    />,
  );
  expect(
    screen.getByText("Your next steps will appear once marking finishes."),
  ).toBeVisible();
  rerender(
    <ResultsNextStep
      rows={[]}
      topics={topics}
      config={{ mode: "mixed", topics: [] }}
      cards={{}}
      note="Explain the mechanism before the example."
    />,
  );
  expect(
    screen.getByText("Explain the mechanism before the example."),
  ).toBeVisible();
});

it("only celebrates full marks when every answer is scored at full marks", () => {
  render(
    <ResultsNextStep
      rows={[row("child", 1, 1, 1), row("full", 4, 4, 2)]}
      topics={topics}
      config={{ mode: "mixed", topics: [] }}
      cards={{}}
    />,
  );
  expect(screen.getByText(/You earned every available mark/)).toBeVisible();
});

it.each([
  ["pending", { status: "pending", mark: null }, "once marking finishes"],
  ["pending check", { check_status: "pending" }, "once marking finishes"],
  ["failed", { status: "failed", mark: null }, "couldn’t be marked"],
  ["unreadable", { status: "unreadable", mark: null }, "couldn’t be marked"],
  ["low confidence", { feedback: { confidence: "low" } }, "couldn’t be marked"],
  ["missing mark", { mark: null }, "couldn’t be marked"],
  [
    "unanswered",
    { mark: 0, feedback: { note: "No answer" } },
    "Focus on Inflation",
  ],
  ["partial marks", { mark: 2 }, "Focus on Inflation"],
] as const)(
  "does not claim full marks with a %s answer",
  (_, unresolved, advice) => {
    render(
      <ResultsNextStep
        rows={[
          row("full", 4, 4, 1),
          { ...row("child", 4, 4, 2), ...unresolved } as ReviewRow,
        ]}
        topics={topics}
        config={{ mode: "mixed", topics: [] }}
        cards={{}}
      />,
    );
    expect(
      screen.queryByText(/You earned every available mark/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(advice))).toBeVisible();
  },
);
