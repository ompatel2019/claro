import {
  cleanup,
  act,
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OverallFeedback } from "./results-report";
import { ResultsBrowser } from "./results-browser";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./session-shell", () => ({
  isTyping: (target: HTMLElement) => target.tagName === "INPUT",
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
const items = [1, 24, 26].map((position) => ({
  position,
  type: "Short answer",
  topic: "Inflation",
  source: "HSC",
  mark: "2 / 4",
  tone: "",
  pill: null,
}));
const views = [1, 24, 26].map((p) => <p key={p}>Answer to Q{p}</p>);
it("preserves question numbering and opens a question from the MC grid", () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(
    <ResultsBrowser
      items={items}
      views={views}
      initial={1}
      mcGrid={[
        { position: 1, your: "B", correct: "C", answered: true, right: false },
        {
          position: 24,
          your: "Not answered",
          correct: "A",
          answered: false,
          right: false,
        },
      ]}
    />,
  );
  expect(screen.getByText("Answer to Q24")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Question 26, 2 / 4 marks" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Table view" }));
  expect(
    within(
      screen.getByRole("table", { name: "Multiple choice answers 1" }),
    ).getByText("Incorrect"),
  ).toBeVisible();
  const unanswered = within(
    screen.getByRole("table", { name: "Multiple choice answers 1" }),
  )
    .getByRole("button", { name: "Review question 24" })
    .closest("tr")!;
  expect(within(unanswered).getAllByText("Not answered")).toHaveLength(2);
  expect(within(unanswered).queryByText("Incorrect")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Review question 1" }));
  expect(screen.getByText("Answer to Q1")).toBeVisible();
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});
it("supports table selection and keyboard question navigation while ignoring typing", () => {
  render(
    <>
      <input aria-label="Note" />
      <ResultsBrowser items={items} views={views} initial={0} />
    </>,
  );
  fireEvent.keyDown(screen.getByLabelText("Note"), { key: "k" });
  expect(screen.getByText("Answer to Q1")).toBeVisible();
  fireEvent.keyDown(window, { key: "k" });
  expect(screen.getByText("Answer to Q24")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Table view" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Question 26, 2 / 4 marks" }),
  );
  expect(screen.getByText("Answer to Q26")).toBeVisible();
});
it("ignores consumed keys and keys within comment navigation", () => {
  render(
    <ResultsBrowser
      items={items}
      initial={0}
      views={[
        <div key="comment" data-comment-navigation>
          <button>Comment</button>
        </div>,
        ...views.slice(1),
      ]}
    />,
  );
  const consumed = new KeyboardEvent("keydown", { key: "k", cancelable: true });
  consumed.preventDefault();
  fireEvent(window, consumed);
  expect(screen.getByText("Comment")).toBeVisible();
  fireEvent.keyDown(screen.getByText("Comment"), { key: "k" });
  expect(screen.getByText("Comment")).toBeVisible();
  fireEvent.keyDown(window, { key: "k" });
  expect(screen.getByText("Answer to Q24")).toBeVisible();
});

it("opens the questioned mark from a report hash and responds to hash changes", async () => {
  window.history.replaceState(null, "", "/student/activity/sit#q-26");
  render(<ResultsBrowser items={items} views={views} initial={0} />);
  expect(await screen.findByText("Answer to Q26")).toBeVisible();
  window.history.replaceState(null, "", "#q-24");
  fireEvent(window, new Event("hashchange"));
  expect(screen.getByText("Answer to Q24")).toBeVisible();
  window.history.replaceState(null, "", "#q-999");
  fireEvent(window, new Event("hashchange"));
  expect(screen.getByText("Answer to Q24")).toBeVisible();
});

it("reselects and scrolls to a summary question after manual navigation with the same hash", async () => {
  const scroll = vi.fn(function (this: HTMLElement) {
    expect(this).toBe(screen.getByText("Answer to Q3"));
  });
  Element.prototype.scrollIntoView = scroll;
  render(
    <>
      <ResultsBrowser
        items={[2, 3].map((position) => ({ ...items[0], position }))}
        views={[2, 3].map((p) => (
          <p id={`q-${p}`} key={p}>
            Answer to Q{p}
          </p>
        ))}
        initial={0}
      />
      <OverallFeedback
        summary={{ strengths: ["At Q3, identify prices."] }}
        pending={false}
      />
    </>,
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole("link", { name: "Go to Q3" }));
  expect(screen.getByText("Answer to Q3")).toBeVisible();
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
  fireEvent.click(
    screen.getByRole("button", { name: "Question 2, 2 / 4 marks" }),
  );
  expect(screen.getByText("Answer to Q2")).toBeVisible();
  expect(window.location.hash).toBe("#q-3");
  fireEvent.click(screen.getByRole("link", { name: "Go to Q3" }));
  expect(screen.getByText("Answer to Q3")).toBeVisible();
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
  // Clicking the selected question again still scrolls to its answer.
  fireEvent.click(screen.getByRole("link", { name: "Go to Q3" }));
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(3));
});

it("draws sprint tiles from the result state, with the open tile in brand-soft", () => {
  const states = ["full", "dropped", "not_answered", "pending"] as const;
  render(
    <ResultsBrowser
      sprintLayout
      items={states.map((state, i) => ({
        ...items[0],
        position: i + 1,
        mark: ["2 / 2", "1.5 / 4", null, null][i],
        pill: state === "not_answered" ? "Not answered" : null,
        state,
      }))}
      views={views}
      initial={1}
    />,
  );
  const tile = (n: number) =>
    screen.getByRole("button", { name: new RegExp(`^Question ${n}(,|$)`) });
  expect(tile(1)).toHaveClass("bg-brand", "text-navy-deep");
  expect(tile(2)).toHaveClass("bg-brand-soft", "text-brand-text");
  expect(tile(2)).toHaveAttribute("aria-current", "true");
  expect(tile(2)).toHaveTextContent("1.5/4");
  expect(tile(3)).toHaveClass("bg-muted");
  expect(tile(3)).toHaveTextContent(/^Q3$/);
  for (const n of [1, 2, 3, 4]) {
    expect(tile(n).querySelector("svg")).toBeTruthy();
    expect(tile(n).className).not.toMatch(/(^|\s)ring-/);
  }
  fireEvent.click(tile(1));
  expect(tile(2)).toHaveClass("bg-destructive-soft", "text-destructive-text");
  expect(screen.getByRole("list", { name: "Key" })).toHaveTextContent(
    "Open nowFull marksMarks droppedNot answered",
  );
});

it("lists every question in a bordered table with the open row highlighted", () => {
  render(
    <ResultsBrowser
      sprintLayout
      items={[
        {
          ...items[0],
          position: 1,
          mark: "2 / 2",
          state: "full",
          pill: "Marked",
        },
        {
          ...items[0],
          position: 2,
          mark: "0 / 4",
          state: "dropped",
          pill: "Checked by our team",
        },
      ]}
      views={views}
      initial={0}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table view" }));
  const table = screen.getByRole("table", { name: "Questions" });
  const rows = within(table).getAllByRole("row");
  expect(rows[1]).toHaveAttribute("data-open", "true");
  expect(rows[1]).toHaveTextContent("Full marks");
  expect(rows[1]).not.toHaveTextContent("Marked");
  expect(rows[2]).toHaveTextContent("0/4");
  expect(rows[2]).toHaveTextContent("Marks dropped");
  expect(within(rows[2]).getByText("Checked by our team")).toBeVisible();
  fireEvent.click(rows[2]);
  expect(rows[2]).toHaveAttribute("data-open", "true");
  expect(rows[1]).not.toHaveAttribute("data-open");
});

it("pages to the previous and next question below the open one", () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(
    <ResultsBrowser
      sprintLayout
      items={[1, 2, 3].map((position) => ({ ...items[0], position }))}
      views={[1, 2, 3].map((n) => (
        <p key={n}>Review {n}</p>
      ))}
      initial={0}
    />,
  );
  const pager = screen.getByRole("navigation", {
    name: "Previous and next question",
  });
  const prev = within(pager).getByRole("button", { name: /Previous question/ });
  const next = within(pager).getByRole("button", { name: /Next question/ });
  expect(prev).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(prev);
  expect(screen.getByText("Review 1")).toBeVisible();
  fireEvent.click(next);
  expect(screen.getByText("Review 2")).toBeVisible();
  expect(prev).not.toHaveAttribute("aria-disabled");
  // Reaching the last question keeps the focused button mounted, so focus is not lost.
  next.focus();
  fireEvent.click(next);
  expect(screen.getByText("Review 3")).toBeVisible();
  expect(next).toBeInTheDocument();
  expect(next).toHaveAttribute("aria-disabled", "true");
  expect(next).toHaveFocus();
  expect(next).toHaveTextContent("Last question");
  fireEvent.click(next);
  expect(screen.getByText("Review 3")).toBeVisible();
  expect(next).toHaveFocus();
  // The same holds paging back to Q1.
  prev.focus();
  fireEvent.click(prev);
  fireEvent.click(prev);
  expect(screen.getByText("Review 1")).toBeVisible();
  expect(prev).toHaveAttribute("aria-disabled", "true");
  expect(prev).toHaveFocus();
  expect(prev).toHaveTextContent("First question");
});

it("lets a terminal status pill speak for an unmarked row in the table", () => {
  render(
    <ResultsBrowser
      sprintLayout
      items={[
        {
          ...items[0],
          position: 1,
          mark: null,
          state: "unmarked",
          pill: "Couldn't mark",
        },
        { ...items[0], position: 2, mark: null, state: "pending" },
      ]}
      views={views}
      initial={0}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table view" }));
  const [, failed, marking] = within(
    screen.getByRole("table", { name: "Questions" }),
  ).getAllByRole("row");
  expect(failed).toHaveTextContent("Couldn't mark");
  expect(failed).not.toHaveTextContent("Being marked");
  expect(marking).toHaveTextContent("Being marked");
});
