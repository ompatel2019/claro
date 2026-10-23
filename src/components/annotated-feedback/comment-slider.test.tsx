import { StrictMode, useRef } from "react";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commentIdsAt,
  stepIndex,
  useCommentSlider,
  useHighlightSync,
} from "./comment-slider";

const comments = [{ id: 11 }, { id: 22 }, { id: 33 }];
const scrollIntoView = vi.fn();
const originalScroll = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

beforeEach(() => {
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalScroll) {
    Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll);
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

function SliderHarness() {
  const slider = useCommentSlider(comments);
  const doc = useRef<HTMLDivElement>(null);
  useHighlightSync(doc, slider.selected?.id ?? null, slider.select);
  return (
    <div onKeyDown={slider.onKeyDown} data-testid="slider">
      <button onClick={slider.prev} disabled={!slider.canPrev}>
        Previous
      </button>
      <button onClick={slider.next} disabled={!slider.canNext}>
        Next
      </button>
      <output data-card={slider.selected?.id}>{slider.selected?.id}</output>
      <input aria-label="Input" />
      <textarea aria-label="Textarea" />
      <select aria-label="Select">
        <option>Option</option>
      </select>
      <div contentEditable suppressContentEditableWarning>
        <span>Editable</span>
      </div>
      <div ref={doc}>
        <mark data-anchors="11">
          <span>First</span>
        </mark>
        <mark data-anchors="22">Second</mark>
      </div>
    </div>
  );
}

function SyncHarness({
  selectedId,
  onSelect,
}: {
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const doc = useRef<HTMLDivElement>(null);
  useHighlightSync(doc, selectedId, onSelect);
  return (
    <div ref={doc}>
      <mark data-anchors="11">
        <span>First</span>
      </mark>
      <mark data-anchors="11 22">
        <span>Shared</span>
      </mark>
      <mark data-anchors="22">Second</mark>
      <mark data-anchors="111">Other</mark>
      <p>Plain</p>
    </div>
  );
}

describe("stepIndex", () => {
  it("steps, clamps at both ends, and handles empty lists", () => {
    expect(stepIndex(1, 3, -1)).toBe(0);
    expect(stepIndex(1, 3, 1)).toBe(2);
    expect(stepIndex(0, 3, -1)).toBe(0);
    expect(stepIndex(2, 3, 1)).toBe(2);
    expect(stepIndex(-10, 3, 1)).toBe(0);
    expect(stepIndex(10, 3, -1)).toBe(2);
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, 0, -1)).toBe(-1);
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });
});

describe("commentIdsAt", () => {
  it("reads the closest ancestor or self and ignores non-integers", () => {
    const el = document.createElement("div");
    el.innerHTML =
      '<mark data-anchors=" 11  22 nope 1.5 3x Infinity -4 "><span></span><mark data-anchors="33"></mark></mark>';
    const outer = el.querySelector("mark");
    expect(commentIdsAt(outer)).toEqual([11, 22, -4]);
    expect(commentIdsAt(el.querySelector("span"))).toEqual([11, 22, -4]);
    expect(commentIdsAt(el.querySelector("mark mark"))).toEqual([33]);
    expect(commentIdsAt(el)).toEqual([]);
    expect(commentIdsAt(null)).toEqual([]);
    outer?.setAttribute("data-anchors", "   ");
    expect(commentIdsAt(outer)).toEqual([]);
  });
});

describe("useCommentSlider", () => {
  it("defaults to the first comment and clamps navigation", () => {
    const { result } = renderHook(() => useCommentSlider(comments));
    expect(result.current).toMatchObject({
      index: 0,
      selected: comments[0],
      count: 3,
      canPrev: false,
      canNext: true,
    });
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => result.current.next());
    expect(result.current).toMatchObject({
      index: 1,
      canPrev: true,
      canNext: true,
    });
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current).toMatchObject({
      index: 2,
      canPrev: true,
      canNext: false,
    });
    act(() => result.current.prev());
    expect(result.current.selected).toBe(comments[1]);
  });

  it("selects by id and ignores unknown ids", () => {
    const { result } = renderHook(() => useCommentSlider(comments));
    act(() => result.current.select(33));
    expect(result.current.index).toBe(2);
    act(() => result.current.select(99));
    expect(result.current.selected).toBe(comments[2]);
  });

  it.each([22, 99, null])("initialises with initialId %s", (initialId) => {
    const { result } = renderHook(() =>
      useCommentSlider(comments, { initialId }),
    );
    expect(result.current.index).toBe(initialId === 22 ? 1 : 0);
  });

  it("keeps the selected id through reorder, filtering, and new objects", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useCommentSlider(items, { initialId: 22 }),
      { initialProps: { items: comments } },
    );
    rerender({ items: [{ id: 33 }, { id: 11 }, { id: 22 }] });
    expect(result.current.index).toBe(2);
    rerender({ items: [{ id: 22 }, { id: 33 }] });
    expect(result.current).toMatchObject({ index: 0, selected: { id: 22 } });
  });

  it("falls back to the clamped index and retains the fallback id", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useCommentSlider(items, { initialId: 22 }),
      { initialProps: { items: comments } },
    );
    rerender({ items: [comments[0], comments[2]] });
    expect(result.current).toMatchObject({ index: 1, selected: { id: 33 } });
    rerender({ items: [comments[2], comments[0]] });
    expect(result.current).toMatchObject({ index: 0, selected: { id: 33 } });
    act(() => result.current.select(11));
    rerender({ items: [comments[2]] });
    expect(result.current).toMatchObject({ index: 0, selected: { id: 33 } });
  });

  it("handles empty lists and transitions to and from them", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useCommentSlider(items),
      { initialProps: { items: [] as { id: number }[] } },
    );
    expect(result.current).toMatchObject({
      index: -1,
      selected: null,
      count: 0,
      canPrev: false,
      canNext: false,
    });
    act(() => result.current.next());
    act(() => result.current.prev());
    act(() => result.current.select(11));
    expect(result.current.index).toBe(-1);
    rerender({ items: comments });
    expect(result.current.selected?.id).toBe(11);
    act(() => result.current.select(33));
    rerender({ items: [] });
    expect(result.current.selected).toBeNull();
    expect(result.current.index).toBe(-1);
  });

  it("syncs buttons, highlight clicks, and the selected card", () => {
    render(<SliderHarness />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("status")).toHaveAttribute("data-card", "22");
    expect(screen.getByText("Second")).toHaveAttribute("data-selected", "true");
    fireEvent.click(screen.getByText("First"));
    expect(screen.getByRole("status")).toHaveAttribute("data-card", "11");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("handles arrows, Home and End, preventing only handled keys", () => {
    render(<SliderHarness />);
    const slider = screen.getByTestId("slider");
    const cases: [string, number][] = [
      ["ArrowRight", 22],
      ["ArrowDown", 33],
      ["ArrowDown", 33],
      ["ArrowLeft", 22],
      ["ArrowUp", 11],
      ["ArrowUp", 11],
      ["End", 33],
      ["Home", 11],
    ];
    for (const [key, id] of cases) {
      const event = createEvent.keyDown(slider, { key });
      fireEvent(slider, event);
      expect(event.defaultPrevented).toBe(true);
      expect(screen.getByRole("status")).toHaveTextContent(String(id));
    }
    const event = createEvent.keyDown(slider, { key: "Enter" });
    fireEvent(slider, event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores form controls, editable descendants, and modifier keys", () => {
    render(<SliderHarness />);
    for (const target of [
      screen.getByLabelText("Input"),
      screen.getByLabelText("Textarea"),
      screen.getByLabelText("Select"),
      screen.getByText("Editable"),
    ]) {
      const event = createEvent.keyDown(target, { key: "ArrowRight" });
      fireEvent(target, event);
      expect(event.defaultPrevented).toBe(false);
    }
    const slider = screen.getByTestId("slider");
    for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
      const event = createEvent.keyDown(slider, {
        key: "End",
        [modifier]: true,
      });
      fireEvent(slider, event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(screen.getByRole("status")).toHaveTextContent("11");
  });
});

describe("useHighlightSync", () => {
  it("delegates clicks to the first id and keeps the latest callback", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <SyncHarness selectedId={11} onSelect={onSelect} />,
    );
    const doc = screen.getByText("Plain").parentElement!;
    const addListener = vi.spyOn(doc, "addEventListener");
    fireEvent.click(screen.getByText("Shared"));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(11);
    fireEvent.click(screen.getByText("Plain"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const replacement = vi.fn();
    rerender(<SyncHarness selectedId={11} onSelect={replacement} />);
    fireEvent.click(screen.getByText("Second"));
    expect(replacement).toHaveBeenCalledExactlyOnceWith(22);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(addListener).not.toHaveBeenCalled();
  });

  it("marks every matching highlight and scrolls the first only on change", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <SyncHarness selectedId={11} onSelect={onSelect} />
      </StrictMode>,
    );
    const first = screen.getByText("First").closest("mark");
    const shared = screen.getByText("Shared").closest("mark");
    const second = screen.getByText("Second");
    expect(first).toHaveAttribute("data-selected", "true");
    expect(shared).toHaveAttribute("data-selected", "true");
    expect(screen.getByText("Other")).not.toHaveAttribute("data-selected");
    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(
      <StrictMode>
        <SyncHarness selectedId={22} onSelect={onSelect} />
      </StrictMode>,
    );
    expect(first).not.toHaveAttribute("data-selected");
    expect(shared).toHaveAttribute("data-selected", "true");
    expect(second).toHaveAttribute("data-selected", "true");
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "nearest",
      behavior: "smooth",
    });
    expect(scrollIntoView.mock.contexts[0]).toBe(shared);
    rerender(
      <StrictMode>
        <SyncHarness selectedId={22} onSelect={onSelect} />
      </StrictMode>,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    rerender(
      <StrictMode>
        <SyncHarness selectedId={null} onSelect={onSelect} />
      </StrictMode>,
    );
    expect(shared).not.toHaveAttribute("data-selected");
    expect(second).not.toHaveAttribute("data-selected");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("uses auto scrolling for reduced motion and tolerates missing matchMedia", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const onSelect = vi.fn();
    const { rerender } = render(
      <SyncHarness selectedId={null} onSelect={onSelect} />,
    );
    rerender(<SyncHarness selectedId={22} onSelect={onSelect} />);
    expect(window.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      block: "nearest",
      behavior: "auto",
    });
    vi.stubGlobal("matchMedia", undefined);
    rerender(<SyncHarness selectedId={11} onSelect={onSelect} />);
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      block: "nearest",
      behavior: "smooth",
    });
    rerender(<SyncHarness selectedId={33} onSelect={onSelect} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(screen.getByText("First").closest("mark")).not.toHaveAttribute(
      "data-selected",
    );
  });

  it("removes the listener and selection attributes on unmount", () => {
    const onSelect = vi.fn();
    const { unmount } = render(
      <SyncHarness selectedId={11} onSelect={onSelect} />,
    );
    const first = screen.getByText("First");
    const doc = first.closest("div")!;
    const removeListener = vi.spyOn(doc, "removeEventListener");
    unmount();
    expect(removeListener).toHaveBeenCalledWith("click", expect.any(Function));
    expect(doc.querySelectorAll("[data-selected]")).toHaveLength(0);
    fireEvent.click(first);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
