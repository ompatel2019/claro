import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NumberedComment } from "@/lib/feedback";
import {
  answerParagraphs,
  columnShift,
  commentFocus,
  connectorPath,
  MarkedAnswerDoc,
  type MarkedScore,
} from "./marked-answer-doc";

const text = "Alpha beta\ngamma delta.";
const comments: NumberedComment[] = [
  {
    id: 11,
    n: 1,
    start: 0,
    quote: "Alpha beta\ngamma",
    kind: "strength",
    tag: "Knowledge",
    body: "Clear cause.",
    next_mark: null,
  },
  {
    id: 22,
    n: 2,
    start: 6,
    quote: "beta\ngamma delta",
    kind: "fix",
    tag: "Evidence",
    body: "Give evidence.",
    next_mark: "Add a statistic.",
  },
  {
    id: 33,
    n: 3,
    start: null,
    quote: "",
    kind: "fix",
    tag: "Structure",
    body: "Conclude.",
    next_mark: "Link the conclusion.",
  },
];
const score: MarkedScore = {
  label: "Your mark: 3/6",
  mark: "3",
  max: 6,
  gain: 3,
  tags: ["Sound"],
  earned: ["Identifies a cause."],
  missing: ["Supports the claim."],
  next: "Add a statistic.",
};
const scrollIntoView = vi.fn();
const originalScroll = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  // jsdom does not provide PointerEvent's pointerType/client coordinates.
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "";
      }
    },
  );
  scrollIntoView.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScroll)
    Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

const slider = () => screen.getByRole("region", { name: "Comments" });
const selected = () => within(slider()).getByRole("group");
const marks = (container: HTMLElement, id: number) => [
  ...container.querySelectorAll(`mark[data-anchors~="${id}"]`),
];
const live = () => slider().querySelector('[aria-live="polite"]')!;

describe("answerParagraphs", () => {
  it("splits LF, CRLF, CR and blank lines while preserving UTF-16 offsets", () => {
    expect(answerParagraphs("😀a\r\nb\n\nc\rd", [])).toEqual([
      [{ text: "😀a", start: 0, comments: [] }],
      [{ text: "b", start: 5, comments: [] }],
      [{ text: "c", start: 8, comments: [] }],
      [{ text: "d", start: 10, comments: [] }],
    ]);
    expect(answerParagraphs("", [])).toEqual([]);
    expect(answerParagraphs("\n\n", [])).toEqual([]);
  });

  it("keeps covering comment indices and offsets across line and overlap boundaries", () => {
    expect(answerParagraphs(text, comments.slice(0, 2))).toEqual([
      [
        { text: "Alpha ", start: 0, comments: [0] },
        { text: "beta", start: 6, comments: [0, 1] },
      ],
      [
        { text: "gamma", start: 11, comments: [0, 1] },
        { text: " delta", start: 16, comments: [1] },
        { text: ".", start: 22, comments: [] },
      ],
    ]);
  });
});

describe("MarkedAnswerDoc", () => {
  it("splits a highlight spanning a line break into two marks with the same id", () => {
    const { container } = render(
      <MarkedAnswerDoc
        text={"one\ntwo"}
        comments={[{ ...comments[0], quote: "one\ntwo" }]}
      />,
    );
    const pieces = marks(container, 11);
    expect(pieces.map((el) => el.textContent)).toEqual(["one", "two"]);
    expect(container.querySelectorAll(".cma-text > p")).toHaveLength(2);
    expect(pieces[0]).toHaveAttribute("role", "button");
    expect(pieces[0]).toHaveAttribute("tabindex", "0");
    expect(pieces[0]).toHaveAccessibleName(
      "Strength 1, Knowledge: Clear cause.",
    );
    expect(pieces[1]).not.toHaveAttribute("role");
    expect(pieces[1]).not.toHaveAttribute("tabindex");
    expect(pieces[1]).not.toHaveAttribute("aria-label");
  });

  it("puts all covering ids innermost first on every piece, with only starts focusable and selected tone on overlaps", () => {
    const { container } = render(
      <MarkedAnswerDoc text={text} comments={comments} />,
    );
    const pieces = [...container.querySelectorAll("mark")];
    expect(pieces.map((el) => el.getAttribute("data-anchors"))).toEqual([
      "11",
      "22 11",
      "22 11",
      "22",
    ]);
    expect(pieces.map((el) => el.getAttribute("tabindex"))).toEqual([
      "0",
      "0",
      null,
      null,
    ]);
    expect(pieces[0]).toHaveClass("cma-hl--earned");
    for (const piece of pieces.slice(1))
      expect(piece).toHaveClass("cma-hl--missed");
    fireEvent.click(screen.getByRole("button", { name: /^Strength 1/ }));
    for (const piece of pieces.slice(0, 3))
      expect(piece).toHaveClass("cma-hl--earned");
    expect(pieces[3]).toHaveClass("cma-hl--missed");
  });

  it("opens on the next-mark fix, keeping other slides inert and hidden", () => {
    const { container } = render(
      <MarkedAnswerDoc text={text} comments={comments} />,
    );
    expect(selected()).toHaveAttribute("data-card", "22");
    expect(selected()).toHaveAccessibleName("Comment 2 of 3");
    expect(slider()).toHaveAttribute("aria-roledescription", "carousel");
    expect(slider().querySelector(".cma-sl-count")).toHaveTextContent(
      "Comment 2 of 3",
    );
    for (const id of [11, 33]) {
      const slide = container.querySelector(`[data-card="${id}"]`)!;
      expect(slide).toHaveAttribute("inert");
      expect(slide).toHaveAttribute("aria-hidden", "true");
      expect(slide).toHaveAttribute("tabindex", "-1");
    }
    expect(selected()).not.toHaveAttribute("inert");
    expect(selected()).not.toHaveAttribute("aria-hidden");
    expect(selected()).toHaveAttribute("tabindex", "0");
  });

  it("chooses a fix with a next-mark instruction ahead of an earlier fix without one", () => {
    render(
      <MarkedAnswerDoc
        text={text}
        comments={[{ ...comments[0], kind: "fix" }, ...comments.slice(1)]}
      />,
    );
    expect(selected()).toHaveAttribute("data-card", "22");
  });

  it("clamps previous and next buttons with aria-disabled at both ends", () => {
    render(<MarkedAnswerDoc text={text} comments={comments} />);
    const prev = screen.getByRole("button", { name: "Previous comment" });
    const next = screen.getByRole("button", { name: "Next comment" });
    expect(prev).toHaveAttribute("aria-disabled", "false");
    expect(next).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(prev);
    expect(selected()).toHaveAttribute("data-card", "11");
    expect(prev).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(prev);
    expect(selected()).toHaveAttribute("data-card", "11");
    fireEvent.click(next);
    fireEvent.click(next);
    expect(selected()).toHaveAttribute("data-card", "33");
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(prev).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(next);
    expect(selected()).toHaveAttribute("data-card", "33");
  });

  it("handles ArrowLeft, ArrowRight, Home and End on the slider and focuses the new slide", () => {
    render(<MarkedAnswerDoc text={text} comments={comments} />);
    for (const [key, id] of [
      ["ArrowLeft", "11"],
      ["ArrowRight", "22"],
      ["End", "33"],
      ["Home", "11"],
    ]) {
      selected().focus();
      fireEvent.keyDown(selected(), { key });
      expect(selected()).toHaveAttribute("data-card", id);
      expect(selected()).toHaveFocus();
    }
    for (const key of ["ArrowDown", "ArrowUp"]) {
      fireEvent.keyDown(slider(), { key });
      expect(selected()).toHaveAttribute("data-card", "11");
    }
  });

  it("clicking a highlight moves data-selected to all its pieces and removes it from old-only pieces", () => {
    const { container } = render(
      <MarkedAnswerDoc text={text} comments={comments} />,
    );
    for (const el of marks(container, 22))
      expect(el).toHaveAttribute("data-selected", "true");
    expect(marks(container, 11)[0]).not.toHaveAttribute("data-selected");
    fireEvent.click(screen.getByRole("button", { name: /^Strength 1/ }));
    expect(selected()).toHaveAttribute("data-card", "11");
    for (const el of marks(container, 11))
      expect(el).toHaveAttribute("data-selected", "true");
    expect(marks(container, 22).at(-1)).not.toHaveAttribute("data-selected");
    fireEvent.click(marks(container, 22)[1]);
    expect(selected()).toHaveAttribute("data-card", "22");
    for (const el of marks(container, 22))
      expect(el).toHaveAttribute("data-selected", "true");
    expect(marks(container, 11)[0]).not.toHaveAttribute("data-selected");
  });

  it.each(["Enter", " "])(
    "%j on a focused highlight selects its comment and focuses its slide",
    (key) => {
      render(<MarkedAnswerDoc text={text} comments={comments} />);
      const highlight = screen.getByRole("button", { name: /^Strength 1/ });
      highlight.focus();
      fireEvent.keyDown(highlight, { key });
      expect(selected()).toHaveAttribute("data-card", "11");
      expect(selected()).toHaveFocus();
    },
  );

  it("clicking the next-mark score row selects its linked comment and updates aria-pressed", () => {
    render(<MarkedAnswerDoc text={text} comments={comments} score={score} />);
    const row = within(
      screen.getByRole("complementary", { name: score.label }),
    ).getByRole("button", { name: "Your next mark: Add a statistic." });
    expect(row).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Strength 1/ }));
    expect(row).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(selected()).toHaveAttribute("data-card", "22");
    expect(selected()).toHaveFocus();
  });

  it("keeps the polite live region empty initially and announces the comment after a user move", () => {
    render(<MarkedAnswerDoc text={text} comments={comments} />);
    expect(live()).toHaveTextContent("");
    expect(live().textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Next comment" }));
    expect(live().textContent).toBe(
      "Comment 3 of 3. Fix 3, Structure: Conclude.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous comment" }));
    expect(live().textContent).toBe(
      "Comment 2 of 3. Fix 2, Evidence: Give evidence.",
    );
  });

  it("moves on horizontal touch swipes left and right, but ignores mouse, vertical, short and cancelled swipes", () => {
    const { container } = render(
      <MarkedAnswerDoc text={text} comments={comments} />,
    );
    const view = container.querySelector(".cma-sl-view")!;
    const swipe = (pointerType: string, x: number, y = 0) => {
      fireEvent.pointerDown(view, { pointerType, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(view, {
        pointerType,
        clientX: 100 + x,
        clientY: 100 + y,
      });
    };
    swipe("touch", -80);
    expect(selected()).toHaveAttribute("data-card", "33");
    swipe("touch", 80);
    expect(selected()).toHaveAttribute("data-card", "22");
    swipe("mouse", -80);
    swipe("touch", -20);
    swipe("touch", -80, 100);
    fireEvent.pointerDown(view, {
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerCancel(view);
    fireEvent.pointerUp(view, {
      pointerType: "touch",
      clientX: 0,
      clientY: 100,
    });
    expect(selected()).toHaveAttribute("data-card", "22");
  });

  it("shows Overall for unanchored comments and the appropriate next-mark box for each fix", () => {
    render(<MarkedAnswerDoc text={text} comments={comments} />);
    expect(within(selected()).getByText("Your next mark")).toBeVisible();
    expect(within(selected()).getByText("Add a statistic.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next comment" }));
    expect(within(selected()).getByText("Overall")).toBeVisible();
    expect(within(selected()).getByText("How to get this mark")).toBeVisible();
    expect(within(selected()).getByText("Link the conclusion.")).toBeVisible();
  });

  it("shows Earned and Missed score rows, remaining marks and Full marks at zero gain", () => {
    const { rerender } = render(
      <MarkedAnswerDoc text={text} comments={comments} score={score} />,
    );
    const card = screen.getByRole("complementary", { name: score.label });
    expect(within(card).getByText("Earned").closest("li")).toHaveTextContent(
      "Identifies a cause.",
    );
    expect(within(card).getByText("Missed").closest("li")).toHaveTextContent(
      "Supports the claim.",
    );
    expect(within(card).getByText("3 to gain")).toBeVisible();
    expect(within(card).getByText("Sound")).toBeVisible();
    rerender(
      <MarkedAnswerDoc
        text={text}
        comments={comments}
        score={{ ...score, gain: 0, mark: "6", label: "Your mark: 6/6" }}
      />,
    );
    expect(screen.getByText("Full marks")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /^Your next mark:/ }),
    ).not.toBeInTheDocument();
  });

  it("omits the score card when score is absent and handles an empty comment list", () => {
    const { rerender } = render(
      <MarkedAnswerDoc text={text} comments={comments} />,
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    rerender(<MarkedAnswerDoc text={text} comments={[]} />);
    expect(
      screen.queryByRole("region", { name: "Comments" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your answer, marked" }),
    ).toBeVisible();
    expect(
      screen.queryByText("Select a highlight to see its comment."),
    ).not.toBeInTheDocument();
  });

  it("handles connector layout, resize and scroll in jsdom without geometry or errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, unmount } = render(
      <MarkedAnswerDoc text={text} comments={comments} />,
    );
    const connector = container.querySelector<SVGElement>(".cma-link")!;
    expect(connector.style.display).toBe("none");
    fireEvent.resize(window);
    fireEvent.scroll(document);
    expect(requestAnimationFrame).toHaveBeenCalled();
    const callback = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
    act(() => callback(0));
    expect(connector.style.display).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "Next comment" }));
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("variants", () => {
  it("is boxed with the AI line by default", () => {
    const { container } = render(
      <MarkedAnswerDoc text={text} comments={comments} score={score} />,
    );
    expect(container.firstElementChild).not.toHaveClass("cma--flush");
    expect(screen.getByText(/AI-assisted and criteria-based/)).toBeVisible();
  });
  it("sits flush in a host card and can leave the AI line to the page", () => {
    const { container } = render(
      <MarkedAnswerDoc text={text} comments={comments} flush aiNote={false} />,
    );
    expect(container.firstElementChild).toHaveClass("cma", "cma--flush");
    expect(
      screen.queryByText(/AI-assisted and criteria-based/),
    ).not.toBeInTheDocument();
  });
});

describe("comment column", () => {
  const card = (id: number) =>
    document.querySelector<HTMLElement>(`[data-card="${id}"]`)!;

  it("focuses one comment and dims the rest, or none when nothing is focused", () => {
    expect(commentFocus([1, 2, 3], null)).toEqual([
      { id: 1, pressed: false, dim: false },
      { id: 2, pressed: false, dim: false },
      { id: 3, pressed: false, dim: false },
    ]);
    expect(commentFocus([1, 2, 3], 2).map((c) => [c.pressed, c.dim])).toEqual([
      [false, true],
      [true, false],
      [false, true],
    ]);
  });

  it("shifts the column so the comment sits level with its phrase, never above the column top", () => {
    expect(columnShift(400, 250, 0, -200)).toBe(150);
    // Measured with a shift already applied.
    expect(columnShift(400, 380, 130, -200)).toBe(150);
    // Up, but the focused comment never rises above the column's top.
    expect(columnShift(100, 250, 0, -200)).toBe(-150);
    expect(columnShift(100, 500, 0, -200)).toBe(-200);
  });

  it("draws a connector from the page edge to the comment, with a tail under the phrase when focused", () => {
    const phrase = { left: 50, right: 120, top: 100, bottom: 118 };
    const box = { left: 700, right: 900, top: 300, bottom: 400 };
    const origin = { left: 0, top: 0 };
    expect(connectorPath(1, phrase, box, origin, 640, false)).toEqual({
      id: 1,
      d: "M640 120H670V320H700",
      tail: null,
    });
    expect(connectorPath(1, phrase, box, origin, 640, true).tail).toBe(
      "M120 120H640",
    );
  });

  it("shows every comment at once with no slider, and the marks card without a slider", () => {
    render(
      <MarkedAnswerDoc text={text} comments={comments} score={score} column />,
    );
    const list = screen.getByRole("region", { name: "Comments" });
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: "Next comment" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/of 3/)).not.toBeInTheDocument();
    for (const id of [11, 22, 33])
      expect(card(id)).toHaveAttribute("aria-pressed", "false");
  });

  it("focuses a comment from its phrase without scrolling, and lights the phrase from the comment", () => {
    const { container } = render(
      <MarkedAnswerDoc text={text} comments={comments} column />,
    );
    scrollIntoView.mockClear();
    fireEvent.click(marks(container, 22)[0]);
    expect(card(22)).toHaveAttribute("aria-pressed", "true");
    expect(card(11)).toHaveAttribute("data-dim");
    expect(card(33)).toHaveAttribute("data-dim");
    expect(card(22)).not.toHaveAttribute("data-dim");
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(card(11));
    expect(card(11)).toHaveAttribute("aria-pressed", "true");
    expect(card(22)).toHaveAttribute("data-dim");
    for (const el of marks(container, 11))
      expect(el).toHaveAttribute("data-selected", "true");
    expect(scrollIntoView).not.toHaveBeenCalled();

    // Selecting it again, or Esc, clears the focus.
    fireEvent.click(card(11));
    expect(card(11)).toHaveAttribute("aria-pressed", "false");
    expect(card(22)).not.toHaveAttribute("data-dim");
    fireEvent.click(card(22));
    fireEvent.keyDown(card(22), { key: "Escape" });
    expect(card(22)).toHaveAttribute("aria-pressed", "false");
  });

  it("moves keyboard focus from a highlight to its comment without scrolling", () => {
    const { container } = render(
      <MarkedAnswerDoc text={text} comments={comments} column />,
    );
    scrollIntoView.mockClear();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    fireEvent.keyDown(marks(container, 22)[0], { key: "Enter" });
    expect(card(22)).toHaveFocus();
    expect(card(22)).toHaveAttribute("aria-pressed", "true");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollIntoView).not.toHaveBeenCalled();
    focus.mockRestore();
  });

  it("brings a comment slid out of the column back into view when it takes keyboard focus", () => {
    render(<MarkedAnswerDoc text={text} comments={comments} column />);
    const list = screen.getByRole("region", { name: "Comments" });
    const rect = (top: number) =>
      ({ top, bottom: top + 80, left: 0, right: 0 }) as DOMRect;
    list.getBoundingClientRect = () => rect(100);
    // The second comment sits 90px down the list and has slid above the window.
    Object.defineProperty(card(22).parentElement!, "offsetTop", { value: 90 });
    card(22).getBoundingClientRect = () => rect(40);
    fireEvent.focus(card(22));
    expect(list.querySelector("ol")).toHaveStyle({
      transform: "translateY(-90px)",
    });
    // Already in view: nothing moves.
    card(11).getBoundingClientRect = () => rect(300);
    fireEvent.focus(card(11));
    expect(list.querySelector("ol")).toHaveStyle({
      transform: "translateY(-90px)",
    });
  });
});
