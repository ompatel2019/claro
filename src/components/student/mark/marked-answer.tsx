"use client";
import { useRef, type ComponentProps } from "react";
import { MarkupAnswer } from "@/components/claro/markup-answer";

/** Link the shared paper and margin notes without changing admin feedback. */
export function MarkedAnswer(props: ComponentProps<typeof MarkupAnswer>) {
  const root = useRef<HTMLDivElement>(null);
  function highlight(target: EventTarget | null) {
    const host = root.current;
    if (!host) return;
    host
      .querySelectorAll(".mk")
      .forEach((el) => el.classList.remove("bg-brand-soft"));
    host
      .querySelectorAll("li[id]")
      .forEach((el) => el.classList.remove("ring-1", "ring-primary/30"));
    if (!(target instanceof Element)) return;
    const note = target.closest("li[id]");
    const tag =
      target.closest("a.mk-tag") ??
      target.closest(".mk")?.parentElement?.querySelector("a.mk-tag");
    const id = note?.id ?? tag?.getAttribute("href")?.slice(1);
    if (!id) return;
    host.querySelectorAll("a.mk-tag").forEach((el) => {
      if (el.getAttribute("href") === `#${id}`)
        el.previousElementSibling?.classList.add("bg-brand-soft");
    });
    host.querySelectorAll("li[id]").forEach((el) => {
      if (el.id === id) el.classList.add("ring-1", "ring-primary/30");
    });
  }
  return (
    <div
      ref={root}
      onMouseOver={(e) => highlight(e.target)}
      onMouseLeave={() => highlight(null)}
      onFocus={(e) => highlight(e.target)}
      onBlur={() => highlight(null)}
    >
      <MarkupAnswer {...props} />
    </div>
  );
}
