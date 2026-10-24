"use client";
import { useOptimistic, useRef, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PROGRESS_RANGES, type ProgressRange } from "@/lib/progress";
import { cn } from "@/lib/utils";

/** Segmented range switcher; the range scopes every card on the page. */
export function ProgressControls({ range }: { range: ProgressRange }) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [pending, startTransition] = useTransition();
  // Shows the chosen range at once, so keys move on from it while the page loads.
  const [shown, setShown] = useOptimistic(range);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function update(value: string) {
    if (value === shown) return;
    const next = new URLSearchParams(params.toString());
    next.set("range", value);
    startTransition(() => {
      setShown(value as ProgressRange);
      router.replace(`${pathname}?${next}`, { scroll: false });
    });
  }
  const current = PROGRESS_RANGES.findIndex((r) => r.value === shown);
  return (
    <div
      role="radiogroup"
      aria-label="Progress range"
      aria-busy={pending}
      className="progress-range"
      onKeyDown={(e) => {
        const step =
          e.key === "ArrowRight" || e.key === "ArrowDown"
            ? 1
            : e.key === "ArrowLeft" || e.key === "ArrowUp"
              ? -1
              : 0;
        if (!step) return;
        e.preventDefault();
        // Move on from the focused option, not the range still loading.
        const focused = refs.current.findIndex(
          (el) => el === document.activeElement,
        );
        const n = PROGRESS_RANGES.length,
          i = ((focused >= 0 ? focused : current) + step + n) % n;
        refs.current[i]?.focus();
        update(PROGRESS_RANGES[i].value);
      }}
    >
      {PROGRESS_RANGES.map((r, i) => (
        <button
          key={r.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={r.value === shown}
          tabIndex={r.value === shown ? 0 : -1}
          onClick={() => update(r.value)}
          className={cn(r.value === shown && "is-on")}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
