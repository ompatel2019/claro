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
      mcGrid={[{ position: 1, your: "B", correct: "C", right: false }]}
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
  window.history.replaceState(null, "", "/student/sprint/sit/results#q-26");
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
  fireEvent.click(screen.getByRole("link", { name: "Q3" }));
  expect(screen.getByText("Answer to Q3")).toBeVisible();
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
  fireEvent.click(
    screen.getByRole("button", { name: "Question 2, 2 / 4 marks" }),
  );
  expect(screen.getByText("Answer to Q2")).toBeVisible();
  expect(window.location.hash).toBe("#q-3");
  fireEvent.click(screen.getByRole("link", { name: "Q3" }));
  expect(screen.getByText("Answer to Q3")).toBeVisible();
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
  // Clicking the selected question again still scrolls to its answer.
  fireEvent.click(screen.getByRole("link", { name: "Q3" }));
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(3));
});

it("shows an icon and word for every sprint answer, including spaced and decimal marks", () => {
  const scores = ["4 / 4", "1.5 / 4", "0 / 1", null];
  const sprintItems = scores.map((mark, i) => ({
    ...items[0],
    position: i + 1,
    mark,
  }));
  render(
    <ResultsBrowser
      sprintLayout
      items={sprintItems}
      views={scores.map((_, i) => (
        <p key={i}>Review {i + 1}</p>
      ))}
      initial={0}
    />,
  );
  for (const [i, word] of [
    "Earned",
    "Part marks",
    "Missed",
    "Not answered",
  ].entries()) {
    const tile = screen.getByRole("button", {
      name: new RegExp(`^Question ${i + 1}(,|$)`),
    });
    expect(tile).toHaveTextContent(word);
    expect(tile.querySelector("svg")).toBeTruthy();
  }
  expect(
    screen.getByRole("button", { name: "Question 2, 1.5/4 marks" }),
  ).toHaveTextContent("1.5/4");
  fireEvent.click(screen.getByRole("button", { name: "Table view" }));
  expect(screen.getByRole("table", { name: "Questions" })).toHaveTextContent(
    "Part marks",
  );
});
