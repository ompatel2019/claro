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
