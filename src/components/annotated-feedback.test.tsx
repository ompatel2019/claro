import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: vi.fn() }));
import { toast } from "sonner";
import { readComments, type ReviewRow } from "@/lib/feedback";
import {
  AnnotatedFeedback,
  displayAnswer,
  type FeedbackEdit,
} from "./annotated-feedback";
import { McReview } from "./mc-review";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia = () => ({ matches: true }) as MediaQueryList;
  Element.prototype.scrollIntoView = vi.fn();
});

const text = "Inflation rose because demand grew. Wages lagg[?] behind.";
const row: ReviewRow = {
  attempt_id: "a1",
  position: 1,
  question_id: "q1",
  type: "short",
  marks: 6,
  stem: "Explain inflation.",
  stimulus: null,
  options: null,
  source: "2023 HSC",
  topic_id: "macro",
  year: 2023,
  choice_index: null,
  answer_text: text,
  transcript: null,
  image_paths: null,
  flagged: false,
  status: "marked",
  check_status: "agreed",
  mark: 3,
  max_marks: 6,
  band: "Sound",
  feedback: {
    comments: [
      {
        quote: "demand grew",
        start: 23,
        kind: "strength",
        tag: "Knowledge",
        body: "Correct cause.",
        next_mark: null,
      },
      {
        quote: "Inflation rose",
        start: 0,
        kind: "fix",
        tag: "Evidence",
        body: "Give a CPI figure.",
        next_mark: "Quote the 2022 CPI.",
      },
      {
        quote: "",
        start: null,
        kind: "fix",
        tag: "Structure",
        body: "Add a conclusion.",
        next_mark: null,
      },
    ],
  },
  correct_index: null,
  criteria: [
    { min: 5, max: 6, descriptor: "Thorough" },
    { min: 3, max: 4, descriptor: "Sound" },
    { min: 1, max: 2, descriptor: "Basic" },
  ],
  sample_answer: "Model text.",
  explanation: null,
  review: null,
};

const editLayout = (): FeedbackEdit => ({
  comments: readComments(row.feedback, text),
  nextMark: "Quote the 2022 CPI.",
  onChange: vi.fn(),
  onUndo: vi.fn(),
});

it("shows the summary, numbered highlights and an Overall group", () => {
  render(<AnnotatedFeedback row={row} />);
  expect(screen.getByLabelText("Your mark: 3/6")).toBeTruthy();
  expect(screen.getByText("Band: 3–4 marks")).toBeTruthy();
  expect(screen.getByText("Marked")).toBeTruthy();
  expect(screen.getAllByText("Quote the 2022 CPI.")).toHaveLength(2);
  expect(screen.queryByText("Next mark:")).not.toBeInTheDocument();
  const fix = screen.getByRole("button", {
    name: "Fix 1, Evidence: Give a CPI figure.",
  });
  expect(fix.textContent).toBe("Inflation rose");
  screen.getByRole("button", { name: "Strength 2, Knowledge: Correct cause." });
  expect(screen.getByText("Overall")).toBeTruthy();
  expect(
    screen.getByTitle("Hard to read. Not counted against you.").textContent,
  ).toBe("lagg[?]");
});

it("filters to strengths and moves through comments with J in edit mode", () => {
  render(<AnnotatedFeedback row={row} edit={editLayout()} />);
  fireEvent.click(screen.getByRole("button", { name: "Strengths (1)" }));
  expect(screen.queryByRole("button", { name: /^Fix 1/ })).toBeNull();
  expect(screen.queryByText("Overall")).toBeNull();
  fireEvent.keyDown(screen.getByRole("button", { name: "Strengths (1)" }), {
    key: "j",
  });
  expect(document.activeElement?.getAttribute("aria-label")).toMatch(
    /^Strength 2/,
  );
});

it("opens the editable comment in a popover when a highlight is tapped on narrow screens", async () => {
  render(<AnnotatedFeedback row={row} edit={editLayout()} />);
  expect(screen.getAllByLabelText("Comment")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: /^Fix 1/ }));
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(
    within(screen.getByRole("dialog")).getByLabelText("Comment"),
  ).toHaveValue("Give a CPI figure.");
});

it("reads old-shape comments without tags", () => {
  render(
    <AnnotatedFeedback
      row={{
        ...row,
        feedback: {
          comments: [
            {
              quote: "demand grew",
              start: 23,
              line: 1,
              type: "improvement",
              comment: "Say why.",
            },
          ],
        },
      }}
    />,
  );
  screen.getByRole("button", { name: "Fix 1: Say why." });
});

it("hides the mark while marking and pills each review state", () => {
  const { rerender } = render(
    <AnnotatedFeedback row={{ ...row, status: "marking" }} />,
  );
  expect(screen.queryByLabelText("Your mark: 3/6")).toBeNull();
  screen.getByText("Marking");
  const review = {
    status: "open",
    ai_mark: 3,
    check_mark: 4,
    final_mark: null,
  } as const;
  rerender(
    <AnnotatedFeedback
      row={{
        ...row,
        check_status: "in_review",
        review: { ...review, reason: "check_disagreed" },
      }}
    />,
  );
  screen.getByLabelText("Your mark: 3/6");
  expect(screen.queryByText("3–4 / 6")).toBeNull();
  screen.getByText("Provisional");
  rerender(
    <AnnotatedFeedback
      row={{
        ...row,
        check_status: "in_review",
        review: { ...review, reason: "student_dispute" },
      }}
    />,
  );
  screen.getByText("Being double-checked");
  rerender(<AnnotatedFeedback row={{ ...row, check_status: "reviewed" }} />);
  screen.getByText("Checked by our team");
  rerender(<AnnotatedFeedback row={{ ...row, status: "failed" }} />);
  screen.getByRole("alert");
  screen.getByRole("button", { name: "Retry" });
});

it("edit mode makes comments and the next-mark line editable; read-only view has no fields", () => {
  const { rerender } = render(<AnnotatedFeedback row={row} />);
  expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /^Delete comment/ })).toBeNull();
  screen.getByRole("link", { name: "Practise similar" });
  const edit: FeedbackEdit = {
    comments: [
      {
        id: 1,
        quote: "Inflation rose",
        start: 0,
        kind: "fix",
        tag: "Evidence",
        body: "Give a CPI figure.",
        next_mark: "Quote the 2022 CPI.",
      },
      {
        id: 0,
        quote: "demand grew",
        start: 23,
        kind: "strength",
        tag: "Knowledge",
        body: "Correct cause.",
        next_mark: null,
      },
    ],
    nextMark: "Quote the 2022 CPI.",
    onChange: vi.fn(),
    onUndo: vi.fn(),
  };
  rerender(<AnnotatedFeedback row={row} edit={edit} />);
  expect(screen.queryByRole("link", { name: "Practise similar" })).toBeNull();
  // Numbered by position, not by id.
  screen.getByRole("button", { name: "Fix 1, Evidence: Give a CPI figure." });
  const bodies = screen.getAllByLabelText("Comment");
  expect(bodies.map((b) => (b as HTMLTextAreaElement).value)).toEqual([
    "Give a CPI figure.",
    "Correct cause.",
  ]);
  fireEvent.change(bodies[1], { target: { value: "Correct, clear cause." } });
  // The edited entry also carries the display number `n` (see review notes).
  expect(edit.onChange).toHaveBeenLastCalledWith(
    [
      edit.comments[0],
      expect.objectContaining({
        ...edit.comments[1],
        body: "Correct, clear cause.",
      }),
    ],
    "Quote the 2022 CPI.",
  );
  fireEvent.change(screen.getAllByLabelText("Kind")[0], {
    target: { value: "strength" },
  });
  expect(edit.onChange).toHaveBeenLastCalledWith(
    [
      expect.objectContaining({
        ...edit.comments[0],
        kind: "strength",
        next_mark: null,
      }),
      edit.comments[1],
    ],
    "Quote the 2022 CPI.",
  );
  // Delete buttons are labelled by display number so screen readers can tell them apart.
  fireEvent.click(screen.getByRole("button", { name: "Delete comment 1" }));
  expect(edit.onChange).toHaveBeenLastCalledWith(
    [edit.comments[1]],
    "Quote the 2022 CPI.",
  );
  const [title, options] = vi.mocked(toast).mock.calls[0];
  expect(title).toBe("Comment deleted");
  (options!.action as { onClick: (e?: unknown) => void }).onClick();
  // The toast's Undo hands back exactly the deleted comment (no display number).
  expect(edit.onUndo).toHaveBeenCalledWith(edit.comments[0]);
  expect(edit.onUndo).toHaveBeenCalledTimes(1);
  expect(vi.mocked(edit.onUndo).mock.calls[0][0]).not.toHaveProperty("n");
  fireEvent.change(
    screen.getByRole("textbox", { name: "What gets you the next mark" }),
    { target: { value: "Cite CPI." } },
  );
  expect(edit.onChange).toHaveBeenLastCalledWith(edit.comments, "Cite CPI.");
  const removeAllRanges = vi.fn();
  vi.spyOn(window, "getSelection").mockReturnValue({
    removeAllRanges,
  } as unknown as Selection);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(removeAllRanges).toHaveBeenCalled();
});

const mc: ReviewRow = {
  ...row,
  type: "mcq",
  options: ["One", "Two", "Three", "Four"],
  correct_index: 2,
  choice_index: 1,
  explanation: "Because three.",
};

it("shows the MC answer line with the explanation open when wrong", () => {
  const { container, rerender } = render(<McReview row={mc} />);
  screen.getByText("Your answer: B · Correct: C");
  expect(container.querySelector("details")?.open).toBe(true);
  rerender(<McReview row={{ ...mc, choice_index: 2 }} />);
  expect(container.querySelector("details")?.open).toBe(false);
  rerender(<McReview row={{ ...mc, choice_index: null }} />);
  screen.getByText("Not answered · Correct: C");
});

it("admin read-only mode preserves failed answers without an AI retry control", () => {
  render(
    <AnnotatedFeedback
      row={{ ...row, status: "failed", check_status: "skipped" }}
      readOnly
    />,
  );
  expect(screen.getByText("We couldn’t mark this one.")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Retry/ }),
  ).not.toBeInTheDocument();
});

it.each([null, 0, 3])(
  "shows the reliability note instead of a score for low-confidence marking (%s)",
  (mark) => {
    const note =
      "We can't mark this reliably: your marking criteria don't add up to 6 marks.";
    render(
      <AnnotatedFeedback
        row={{
          ...row,
          question_id: null,
          mark,
          band: null,
          check_status: "skipped",
          feedback: { note, confidence: "low" },
        }}
        photos={[]}
      />,
    );
    expect(screen.getByText(note)).toBeInTheDocument();
    expect(screen.queryByText(`${mark ?? 0} / 6`)).not.toBeInTheDocument();
    expect(
      screen.queryByText("What gets you the next mark"),
    ).not.toBeInTheDocument();
  },
);

it.each([
  ["one\ntwo", "one two"],
  ["one\rtwo", "one two"],
  ["one\r\ntwo", "one  two"],
  ["one\n\ntwo", "one\n\ntwo"],
  ["one\r\n\r\ntwo", "one\r\n\r\ntwo"],
  ["one\r\rtwo", "one\r\rtwo"],
  ["one\n\r\ntwo", "one\n\r\ntwo"],
  ["one\r\n\ntwo", "one\r\n\ntwo"],
  ["one\n\n\ntwo", "one\n\n\ntwo"],
  ["\n😀\r\nend\n", " 😀  end "],
  ["one\n \ntwo", "one   two"],
  ["unchanged", "unchanged"],
])(
  "reflows only single breaks, preserving every offset in %j",
  (input, expected) => {
    const displayed = displayAnswer(input);
    expect(displayed).toBe(expected);
    expect(displayed.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      expect(displayed[i]).toBe(
        /[\r\n]/.test(input[i]) ? expected[i] : input[i],
      );
    }
  },
);

it.each(["answer_text", "transcript"] as const)(
  "renders %s paragraphs across highlight boundaries without changing source quotes",
  (source) => {
    const answer = "First\r\nclaim\n\nLast\npoint.";
    const quote = "First\r\nclaim\n";
    const fixture = {
      ...row,
      [source]: answer,
      feedback: {
        comments: [
          { quote, start: 0, kind: "strength", body: "First comment." },
          {
            quote: "point",
            start: answer.indexOf("point"),
            kind: "fix",
            body: "Last comment.",
          },
        ],
      },
    };
    const { container } = render(<AnnotatedFeedback row={fixture} />);
    const paragraphs = [...container.querySelectorAll(".cma-text > p")];
    expect(paragraphs.map((p) => p.textContent)).toEqual(
      source === "transcript"
        ? ["First  claim", "Last point."]
        : ["First", "claim", "Last", "point."],
    );
    const pieces = [...container.querySelectorAll('mark[data-anchors~="0"]')];
    expect(pieces.map((p) => p.textContent)).toEqual(
      source === "transcript" ? ["First  claim"] : ["First", "claim"],
    );
    expect(pieces[0]).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: /^Fix 2/ })).toHaveTextContent(
      "point",
    );
    expect(fixture[source]).toBe(answer);
    expect(fixture.feedback.comments[0].quote).toBe(quote);
  },
);

it("keeps original line breaks in quotes selected for editing", async () => {
  const onChange = vi.fn();
  const answer = "First\r\nclaim.";
  const { container } = render(
    <AnnotatedFeedback
      row={{ ...row, answer_text: answer, feedback: { comments: [] } }}
      edit={{ comments: [], nextMark: "", onChange, onUndo: vi.fn() }}
    />,
  );
  const doc = container.querySelector(".whitespace-pre-wrap")!;
  const range = document.createRange();
  range.selectNodeContents(doc);
  range.getBoundingClientRect = () => new DOMRect();
  vi.spyOn(window, "getSelection").mockReturnValue({
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => range,
    removeAllRanges: vi.fn(),
  } as unknown as Selection);
  fireEvent.pointerUp(doc);
  await waitFor(() => expect(screen.getByLabelText("Comment")).toBeVisible());
  fireEvent.change(screen.getByLabelText("Comment"), {
    target: { value: "Explain this." },
  });
  fireEvent.click(screen.getByRole("button", { name: /Add comment/ }));
  expect(onChange).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        start: 0,
        quote: answer,
        body: "Explain this.",
      }),
    ],
    "",
  );
});

it("uses semantic strength and fix bands in the comment slider", () => {
  const { container } = render(<AnnotatedFeedback row={row} />);
  const strength = container.querySelector('[data-card="0"]')!;
  const fix = container.querySelector('[data-card="1"]')!;
  expect(strength).toHaveClass("cma-slide--earned");
  expect(fix).toHaveClass("cma-slide--missed");
  expect(
    within(strength as HTMLElement).getByText("Strength"),
  ).toBeInTheDocument();
  expect(within(fix as HTMLElement).getByText("Fix")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /^Strength 2/ }));
  expect(strength).not.toHaveAttribute("aria-hidden");
  expect(fix).toHaveAttribute("aria-hidden", "true");
});

it("stacks filtered wide edit cards in normal flow and restores highlight alignment for All", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        if (target.hasAttribute("data-comment-navigation")) {
          this.callback(
            [{ contentRect: { width: 1200 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
      }
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const anchor = this.getAttribute("data-anchors");
      return new DOMRect(
        0,
        anchor === "1" ? 200 : anchor === "0" ? 800 : 0,
        300,
        100,
      );
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
  const { container } = render(
    <AnnotatedFeedback row={row} edit={editLayout()} />,
  );
  const anchored = () => [
    ...container.querySelectorAll<HTMLElement>("[data-anchored]"),
  ];
  expect(anchored()).toHaveLength(2);
  expect(anchored().every((card) => card.classList.contains("absolute"))).toBe(
    true,
  );
  for (const filter of ["Strengths (1)", "Fixes (2)"]) {
    fireEvent.click(screen.getByRole("button", { name: filter }));
    expect(anchored()).toHaveLength(0);
    const list = container.querySelector("ol")!;
    expect(list).toHaveClass("space-y-2");
    const cards = [...list.querySelectorAll("[data-card]")];
    expect(cards).toHaveLength(filter.startsWith("Strengths") ? 1 : 2);
    cards.forEach((card) => {
      expect(card).not.toHaveClass("absolute");
      expect((card as HTMLElement).style.top).toBe("");
    });
  }
  fireEvent.click(screen.getByRole("button", { name: "All (3)" }));
  expect(anchored()).toHaveLength(2);
  expect(anchored().map((card) => card.style.top)).toEqual(["200px", "800px"]);
});

it("replaces a rubric with gaps with an honest unavailable message and no band label", () => {
  render(
    <AnnotatedFeedback row={{ ...row, criteria: row.criteria!.slice(0, 2) }} />,
  );
  expect(screen.queryByRole("table", { hidden: true })).toBeNull();
  expect(screen.queryByText("Band: 3–4 marks")).toBeNull();
  expect(screen.getByText(/guidelines are incomplete/)).toBeInTheDocument();
  expect(screen.getByText("Sample answer")).toBeVisible();
});
it("keeps complete ranged guidelines and their matching band", () => {
  render(<AnnotatedFeedback row={row} />);
  expect(screen.getByRole("table", { hidden: true })).toHaveTextContent("1–2");
  expect(screen.getByText("Band: 3–4 marks")).toBeVisible();
});
it.each(["short", "extended"] as const)(
  "hides the outline at full marks for %s and keeps it below full marks",
  (type) => {
    const feedback = {
      ...row.feedback,
      better_answer_outline: ["Link demand to prices."],
    };
    const { rerender } = render(
      <AnnotatedFeedback row={{ ...row, type, mark: 6, feedback }} />,
    );
    expect(screen.queryByText("How to reach full marks")).toBeNull();
    expect(screen.getByText("Full marks")).toBeVisible();
    rerender(<AnnotatedFeedback row={{ ...row, type, mark: 5, feedback }} />);
    expect(screen.getByText("How to reach full marks")).toBeVisible();
  },
);

it("uses the document score, criteria and next-mark row in standalone results", () => {
  render(<AnnotatedFeedback row={row} singleResult />);
  for (const name of ["Marking criteria", "Your answer, marked"]) {
    expect(screen.getByRole("heading", { name })).toBeVisible();
  }
  expect(
    screen.getByRole("complementary", { name: "Your mark: 3/6" }),
  ).toBeVisible();
  expect(screen.getByText("Band: 3–4 marks")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Fix 1, Evidence: Give a CPI figure." }),
  ).toBeVisible();
  expect(screen.getByText("3 to gain")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Your next mark: Quote the 2022 CPI." }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText("What gets you the next mark")).toBeNull();
});

it("keeps low-confidence states honest in standalone results", () => {
  render(
    <AnnotatedFeedback
      singleResult
      row={{
        ...row,
        feedback: { confidence: "low", note: "Needs a clearer answer." },
      }}
    />,
  );
  expect(screen.getByText("Needs a clearer answer.")).toBeVisible();
  expect(screen.queryByRole("img", { name: "3 out of 6" })).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Marking criteria" }),
  ).toBeVisible();
});

it.each([
  [false, false, 759, false],
  [false, true, 759, false],
  [false, false, 1100, true],
  [false, true, 1100, true],
  [true, false, 759, false],
  [true, false, 900, true],
  [true, true, 759, false],
  [true, true, 900, true],
] as const)(
  "uses the document in read-only mode and responsive margin layout in edit mode (single=%s edit=%s width=%s)",
  (singleResult, editing, width, wide) => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private callback: ResizeObserverCallback) {}
        observe(target: Element) {
          if (target.hasAttribute("data-comment-navigation")) {
            this.callback(
              [{ contentRect: { width } } as ResizeObserverEntry],
              this as unknown as ResizeObserver,
            );
          }
        }
        disconnect() {}
      },
    );
    const edit = editing
      ? { comments: [], nextMark: "", onChange: vi.fn(), onUndo: vi.fn() }
      : undefined;
    const { container } = render(
      <AnnotatedFeedback row={row} singleResult={singleResult} edit={edit} />,
    );
    if (!editing) {
      expect(container.querySelector(".cma-text")).toHaveTextContent(
        "Inflation rose",
      );
      expect(screen.getByRole("region", { name: "Comments" })).toHaveAttribute(
        "aria-roledescription",
        "carousel",
      );
      expect(container.querySelector(".grid.gap-6")).toBeNull();
      return;
    }
    expect(container.querySelector(".whitespace-pre-wrap")).toHaveClass(
      "relative",
    );
    expect(container.querySelector(".whitespace-pre-wrap")?.className).toBe(
      singleResult
        ? "booklet relative min-h-28 font-serif text-xl leading-[32px] whitespace-pre-wrap"
        : "relative max-w-[70ch] font-serif text-xl leading-8 whitespace-pre-wrap",
    );
    expect(!!container.querySelector(".booklet")).toBe(singleResult);
    const grid = container.querySelector(".grid.gap-6")!;
    expect(grid).toBeTruthy();
    expect(grid.classList.contains("grid-cols-[minmax(0,1fr)_300px]")).toBe(
      wide && singleResult,
    );
    expect(grid.classList.contains("grid-cols-[minmax(0,1fr)_320px]")).toBe(
      wide && !singleResult,
    );
  },
);

it("shows criteria, answer with semantic highlights and slides, then an open sample answer", () => {
  localStorage.setItem("claro-feedback-model", "0");
  const { container } = render(<AnnotatedFeedback row={row} />);
  const criteria = screen.getByRole("region", { name: "Marking criteria" });
  const answer = screen.getByRole("heading", { name: "Your answer, marked" });
  const sample = screen.getByRole("region", { name: "Sample answer" });
  expect(
    criteria.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    answer.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByText("Model text.")).toBeVisible();
  expect(sample.closest("details")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Top fixes" })).toBeNull();
  for (const [kind, tone, id] of [
    ["Strength", "earned", "0"],
    ["Fix", "missed", "1"],
  ]) {
    const highlight = screen.getByRole("button", {
      name: new RegExp(`^${kind} [12],`),
    });
    expect(highlight).toHaveClass("cma-hl", `cma-hl--${tone}`);
    const note = container.querySelector(`[data-card="${id}"]`)!;
    expect(note).toHaveClass(`cma-slide--${tone}`);
    expect(note).toHaveTextContent(kind);
  }
  localStorage.clear();
});

it("keeps every fix's next-mark instruction in its slide and the summary in the score row", () => {
  const comments = readComments(row.feedback, text).map((c, i) => ({
    ...c,
    next_mark: i === 2 ? "Link the conclusion to inflation." : c.next_mark,
  }));
  const { container } = render(
    <AnnotatedFeedback
      singleResult
      readOnly
      row={{
        ...row,
        feedback: {
          ...row.feedback,
          comments,
          next_mark_line: "Focus on evidence and structure.",
        },
      }}
    />,
  );
  for (const [body, instruction, title] of [
    ["Give a CPI figure.", "Quote the 2022 CPI.", "Your next mark"],
    [
      "Add a conclusion.",
      "Link the conclusion to inflation.",
      "How to get this mark",
    ],
  ]) {
    const card = screen.getByText(body).closest("[data-card]") as HTMLElement;
    const highlightOrNext =
      title === "Your next mark"
        ? screen.getByRole("button", { name: /^Fix 1/ })
        : screen.getByRole("button", { name: "Next comment" });
    fireEvent.click(highlightOrNext);
    if (title !== "Your next mark") fireEvent.click(highlightOrNext);
    expect(card).not.toHaveAttribute("aria-hidden");
    expect(within(card).getByText(title)).toBeVisible();
    expect(within(card).getByText(instruction)).toBeVisible();
  }
  expect(
    within(container.querySelector("aside")!).getByText(
      "Focus on evidence and structure.",
    ),
  ).toBeVisible();
});

it.each([
  ["Demand falls", "falls as prices", 7],
  ["Demand falls as prices", "falls", 7],
])(
  "keeps overlapping or nested quotes %j and %j focusable",
  (outer, inner, start) => {
    const { container } = render(
      <AnnotatedFeedback
        row={{
          ...row,
          answer_text: "Demand falls as prices rise.",
          feedback: {
            comments: [
              {
                quote: outer,
                start: 0,
                kind: "strength",
                body: "Clear demand link.",
              },
              {
                quote: inner,
                start,
                kind: "fix",
                body: "Explain the price link.",
              },
            ],
          },
        }}
      />,
    );
    for (const [name, id, number, body] of [
      [/^Strength 1/, "0", "1", "Clear demand link."],
      [/^Fix 2/, "1", "2", "Explain the price link."],
    ] as const) {
      const highlight = screen.getByRole("button", { name });
      expect(highlight.tagName).toBe("MARK");
      expect(highlight).toHaveAttribute("tabindex", "0");
      expect(highlight.getAttribute("data-anchors")?.split(" ")).toContain(id);
      highlight.focus();
      expect(highlight).toHaveFocus();
      const card = container.querySelector(`[data-card="${id}"]`)!;
      expect(card).toHaveAttribute("aria-label", `Comment ${number} of 2`);
      expect(card).toHaveTextContent(body);
    }
    expect(
      screen.queryByRole("heading", { name: "Overall" }),
    ).not.toBeInTheDocument();
  },
);

it("keeps typed lines as paragraphs and reflows transcript single breaks unless requested", () => {
  const fixture = { ...row, answer_text: "a\nb", feedback: null };
  const { container, rerender } = render(<AnnotatedFeedback row={fixture} />);
  const paragraphs = () =>
    [...container.querySelectorAll(".cma-text > p")].map((p) => p.textContent);
  expect(paragraphs()).toEqual(["a", "b"]);
  rerender(<AnnotatedFeedback row={{ ...fixture, transcript: "a\nb" }} />);
  expect(paragraphs()).toEqual(["a b"]);
  rerender(
    <AnnotatedFeedback
      row={{ ...fixture, transcript: "a\nb" }}
      keepLineBreaks
    />,
  );
  expect(paragraphs()).toEqual(["a", "b"]);
});

it.each([false, true])(
  "answerOnly hides host-owned sections (singleResult=%s)",
  (singleResult) => {
    render(
      <AnnotatedFeedback
        row={{
          ...row,
          feedback: {
            ...row.feedback,
            better_answer_outline: ["Add evidence."],
          },
        }}
        singleResult={singleResult}
        answerOnly
        actions={<button>Host action</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Your answer, marked" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Comments" })).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Marking criteria" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.queryByText("What gets you the next mark"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Your next mark")).toBeVisible();
    expect(
      screen.queryByRole("complementary", { name: "Your mark: 3/6" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("How to reach full marks"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Sample answer" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Practise similar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Host action" }),
    ).not.toBeInTheDocument();
  },
);

it("anchors to the transcript before the typed answer", () => {
  render(
    <AnnotatedFeedback
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
    />,
  );
  expect(screen.getByRole("button", { name: /^Strength 1/ })).toHaveTextContent(
    "Prices",
  );
  expect(screen.queryByText("Something else.")).not.toBeInTheDocument();
});
