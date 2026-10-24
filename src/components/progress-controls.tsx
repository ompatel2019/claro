"use client";
import { useRef, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PROGRESS_RANGES, type ProgressRange } from "@/lib/progress";
import { cn } from "@/lib/utils";

/** Segmented range switcher; the range scopes every card on the page. */
export function ProgressControls({ range }: { range: ProgressRange }) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function update(value: string) {
    if (value === range) return;
    const next = new URLSearchParams(params.toString());
    next.set("range", value);
    startTransition(() =>
      router.replace(`${pathname}?${next}`, { scroll: false }),
    );
  }
  const current = PROGRESS_RANGES.findIndex((r) => r.value === range);
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
        const n = PROGRESS_RANGES.length,
          i = (current + step + n) % n;
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
          aria-checked={r.value === range}
          tabIndex={r.value === range ? 0 : -1}
          onClick={() => update(r.value)}
          className={cn(r.value === range && "is-on")}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
