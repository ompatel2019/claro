/**
 * Comment slider state and highlight sync for the marked-answer doc: one comment
 * at a time, prev/next and arrow keys, synced both ways with answer highlights
 * (`mark[data-anchors]`).
 */
import { useEffect, useRef, useState } from "react";

export function stepIndex(index: number, count: number, step: -1 | 1): number {
  return count === 0 ? -1 : Math.max(0, Math.min(count - 1, index + step));
}

export function commentIdsAt(el: Element | null): number[] {
  const anchors = el?.closest("[data-anchors]")?.getAttribute("data-anchors");
  return (anchors?.trim().split(/\s+/) ?? [])
    .filter((id) => /^[+-]?\d+$/.test(id))
    .map(Number)
    .filter(Number.isInteger);
}

export function useCommentSlider<T extends { id: number }>(
  comments: T[],
  options?: { initialId?: number | null },
) {
  const [selection, setSelection] = useState<{
    index: number;
    id: number | null;
  }>(() => {
    const found = comments.findIndex(
      (comment) => comment.id === options?.initialId,
    );
    const index = comments.length ? Math.max(0, found) : -1;
    return { index, id: comments[index]?.id ?? null };
  });
  const count = comments.length;
  const found = comments.findIndex((comment) => comment.id === selection.id);
  const index =
    count === 0
      ? -1
      : found >= 0
        ? found
        : Math.max(0, Math.min(count - 1, selection.index));
  const selected = index === -1 ? null : comments[index];
  const selectedId = selected?.id ?? null;

  if (index !== selection.index || selectedId !== selection.id) {
    setSelection({ index, id: selectedId });
  }

  function selectIndex(nextIndex: number) {
    setSelection({ index: nextIndex, id: comments[nextIndex]?.id ?? null });
  }

  function prev() {
    selectIndex(stepIndex(index, count, -1));
  }

  function next() {
    selectIndex(stepIndex(index, count, 1));
  }

  function select(id: number) {
    const nextIndex = comments.findIndex((comment) => comment.id === id);
    if (nextIndex >= 0) selectIndex(nextIndex);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      (e.target instanceof Element &&
        e.target.closest("input, textarea, select, [contenteditable]"))
    ) {
      return;
    }

    switch (e.key) {
      case "ArrowLeft":
        prev();
        break;
      case "ArrowRight":
        next();
        break;
      case "Home":
        selectIndex(count ? 0 : -1);
        break;
      case "End":
        selectIndex(count - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  return {
    index,
    selected,
    count,
    canPrev: index > 0,
    canNext: index >= 0 && index < count - 1,
    prev,
    next,
    select,
    onKeyDown,
  };
}

export function useHighlightSync(
  doc: React.RefObject<HTMLElement | null>,
  selectedId: number | null,
  onSelect: (id: number) => void,
  { scroll = true }: { scroll?: boolean } = {},
) {
  const onSelectRef = useRef(onSelect);
  const previousId = useRef(selectedId);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const el = doc.current;
    if (!el) return;
    function onClick(event: MouseEvent) {
      const target =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null;
      const [id] = commentIdsAt(target);
      if (id !== undefined) onSelectRef.current(id);
    }
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("click", onClick);
      el.querySelectorAll("[data-anchors]").forEach((anchor) =>
        anchor.removeAttribute("data-selected"),
      );
    };
  }, [doc]);

  useEffect(() => {
    const el = doc.current;
    let first: Element | undefined;
    el?.querySelectorAll("[data-anchors]").forEach((anchor) => {
      if (
        selectedId !== null &&
        anchor.matches(`[data-anchors~="${selectedId}"]`)
      ) {
        anchor.setAttribute("data-selected", "true");
        first ??= anchor;
      } else {
        anchor.removeAttribute("data-selected");
      }
    });
    if (scroll && previousId.current !== selectedId) {
      const reduced = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      first?.scrollIntoView({
        block: "nearest",
        behavior: reduced ? "auto" : "smooth",
      });
    }
    previousId.current = selectedId;
  }, [doc, selectedId, scroll]);
}
