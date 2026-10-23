import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ReviewRow } from "@/lib/feedback";
import { SingleResult } from "./single-result";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/feedback-widget", () => ({ useFeedback: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
afterEach(cleanup);
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia = () => ({ matches: true }) as MediaQueryList;
  Element.prototype.scrollIntoView = vi.fn();
});
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
  const heading = screen.getByRole("heading", { name: "Your answer, marked" });
  const card = heading.closest('[data-slot="card"]')!;
  expect(card).toContainElement(heading);
  const highlight = within(card as HTMLElement).getByRole("button", {
    name: /^Strength 1/,
  });
  expect(highlight.tagName).toBe("MARK");
  expect(highlight).toHaveTextContent("Demand");
  const overall = within(card as HTMLElement).getByRole("heading", {
    name: "Overall",
  });
  expect(overall.closest("li")).toHaveTextContent("Include evidence.");
  expect(
    within(card as HTMLElement).getByRole("group", { name: "Filter comments" }),
  ).toBeVisible();
  expect(screen.getAllByText("Use a statistic.")).toHaveLength(2);
  screen.getAllByText("Use a statistic.").forEach((line) => {
    expect(line).toBeVisible();
  });
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

it("keeps overlapping comments highlighted and out of Overall", () => {
  const { container } = render(
    <SingleResult
      row={{
        ...row,
        answer_text: "Demand falls as prices rise.",
        feedback: {
          comments: [
            {
              quote: "Demand falls",
              start: 0,
              kind: "strength",
              body: "Clear demand link.",
            },
            {
              quote: "falls as prices",
              start: 7,
              kind: "fix",
              body: "Explain the price link.",
            },
          ],
        },
      }}
      sessionId="session"
      when="2026-10-19T00:00:00Z"
      topic="Economic growth"
    />,
  );
  expect(screen.getByRole("button", { name: /^Strength 1/ }).tagName).toBe(
    "MARK",
  );
  expect(screen.getByRole("button", { name: /^Fix 2/ }).tagName).toBe("MARK");
  expect(container.querySelector('[data-card="0"]')).toHaveTextContent(
    "Clear demand link.",
  );
  expect(container.querySelector('[data-card="1"]')).toHaveTextContent(
    "Explain the price link.",
  );
  expect(
    screen.queryByRole("heading", { name: "Overall" }),
  ).not.toBeInTheDocument();
});

it("keeps every typed answer line break", () => {
  const { container } = render(
    <SingleResult
      row={{ ...row, answer_text: "First line.\nSecond line.", feedback: null }}
      sessionId="session"
      when="2026-10-19T00:00:00Z"
      topic=""
    />,
  );
  expect(container.querySelector(".whitespace-pre-wrap")?.textContent).toBe(
    "First line.\nSecond line.",
  );
});

it("anchors to the transcript before the typed answer", () => {
  render(
    <SingleResult
      row={{
        ...row,
        transcript: "Prices rose.",
        answer_text: "Something else.",
        feedback: {
          comments: [
            {
              quote: "Prices",
              start: 0,
              kind: "strength",
              body: "Clear trend.",
            },
          ],
        },
      }}
      sessionId="session"
      when="2026-10-19T00:00:00Z"
      topic=""
    />,
  );
  expect(screen.getByRole("button", { name: /^Strength 1/ })).toHaveTextContent(
    "Prices",
  );
  expect(screen.queryByText("Something else.")).not.toBeInTheDocument();
});
