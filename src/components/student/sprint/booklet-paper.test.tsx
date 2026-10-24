import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Attempt } from "@/lib/practice";
import { TRACKER_STATE } from "@/components/sprint/tracker-state";
import { BookletPaper } from "./booklet-paper";

afterEach(cleanup);

const base = {
  position: 1,
  status: "pending",
  choice_index: null,
  answer_text: null,
  transcript: null,
  image_paths: null,
  flagged: false,
  mark: null,
  max_marks: null,
  band: null,
  feedback: null,
} satisfies Partial<Attempt>;
const q = (id: string, type: "mcq" | "short", marks: number, stem: string) => ({
  id,
  type,
  marks,
  stem,
  options: type === "mcq" ? ["Price increases", "Price decreases"] : null,
  topic_id: "t",
  source: "HSC",
  stimulus: null,
  year: null,
});
const attempts: Attempt[] = [
  {
    ...base,
    id: "a1",
    question_id: "q1",
    choice_index: 1,
    flagged: true,
    status: "marked",
    mark: 0,
    max_marks: 1,
    question: q("q1", "mcq", 1, "What is deflation?"),
  },
  {
    ...base,
    id: "a2",
    question_id: "q2",
    question: q("q2", "short", 3, "Explain cost-push inflation."),
  },
  {
    ...base,
    id: "a3",
    question_id: "q3",
    answer_text: "Draft",
    transcript: `Rising input costs ${"shift aggregate supply left ".repeat(10)}`,
    status: "marked",
    mark: 2,
    max_marks: 4,
    question: q("q3", "short", 4, "Discuss the RBA cash rate."),
  },
];

function openModal(examMode = true, onJump = vi.fn(), index = 1) {
  render(
    <BookletPaper
      attempts={attempts}
      index={index}
      examMode={examMode}
      onJump={onJump}
    />,
  );
  return screen.getByRole("navigation", { name: "Question booklet" });
}
const row = (dialog: HTMLElement, n: number) =>
  within(dialog)
    .getByRole("button", { name: new RegExp(`^Question ${n}:`) })
    .closest("li")!;
const disc = (li: HTMLElement) => li.querySelector("span[aria-hidden]")!;

it("renders every question with its tracker state, flag and answer preview", () => {
  const dialog = openModal();
  expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);

  const first = row(dialog, 1);
  expect(first.dataset.state).toBe("answered");
  expect(disc(first).className).toContain(TRACKER_STATE.answered);
  expect(first.querySelector("[data-flag]")?.className).toContain(
    TRACKER_STATE.flag,
  );
  expect(first.textContent).toContain("Multiple choice");
  expect(first.textContent).toContain("1 mark");
  expect(first.textContent).toContain("What is deflation?");
  expect(first.textContent).toContain("B. Price decreases");
  expect(first.textContent).toContain("Flagged");

  const second = row(dialog, 2);
  expect(second.dataset.state).toBe("active");
  expect(disc(second).className).toContain(TRACKER_STATE.active);
  expect(
    within(dialog).getByRole("button", { name: "Question 2: Not answered" }),
  ).toHaveProperty("ariaCurrent", "step");
  expect(second.textContent).toContain("Not answered");
  expect(second.textContent).toContain("3 marks");
  expect(second.querySelector("[data-flag]")).toBeNull();

  const third = row(dialog, 3);
  expect(third.dataset.state).toBe("answered");
  // Transcript wins over the typed draft and long answers are truncated.
  expect(third.textContent).toContain("Rising input costs");
  expect(third.textContent).not.toContain("Draft");
  expect(third.textContent).toContain("…");
});

it("marks unanswered, not-current questions grey", () => {
  const dialog = openModal(true, vi.fn(), 0);
  const second = row(dialog, 2);
  expect(second.dataset.state).toBe("unanswered");
  expect(disc(second).className).toContain(TRACKER_STATE.unanswered);
});

it("never shows awarded marks or correctness in Exam mode, even for marked rows", () => {
  const dialog = openModal(true);
  const text = dialog.textContent ?? "";
  expect(text).not.toMatch(/\d+\/\d+|Full marks|Part marks|No marks|Correct/);
  for (const button of within(dialog).getAllByRole("button", {
    name: /^Question/,
  }))
    expect(button.getAttribute("aria-label")).not.toMatch(/\d+\/\d+/);
  // The question's mark value still shows.
  expect(text).toContain("4 marks");
});

it("shows awarded marks with a word in Check as I go mode", () => {
  const dialog = openModal(false);
  expect(row(dialog, 1).textContent).toContain("0/1No marks");
  expect(row(dialog, 3).textContent).toContain("2/4Part marks");
  expect(
    within(dialog).getByRole("button", {
      name: "Question 3: Answered, 2/4 marks",
    }),
  ).toBeTruthy();
});

it("jumps when a question is clicked and stays open (it is a sidebar, not a modal)", () => {
  const onJump = vi.fn();
  const nav = openModal(true, onJump);
  fireEvent.click(within(nav).getByRole("button", { name: /^Question 3:/ }));
  expect(onJump).toHaveBeenCalledWith(2);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(nav.isConnected).toBe(true);
});

it("shows flags in ink-2 with an outline icon, never red", () => {
  const nav = openModal();
  const flag = within(row(nav, 1)).getByText("Flagged");
  expect(flag.className).toContain("text-ink-2");
  expect(flag.className).not.toMatch(/destructive|red/);
});
