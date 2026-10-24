"use client";
import { useEffect, useRef, useState } from "react";
import { Close } from "@/components/icons";
import { calculate } from "@/lib/calc";
import { cn } from "@/lib/utils";

const KEYS = [
  "C",
  "⌫",
  "(",
  ")",
  "%",
  "±",
  "√",
  "÷",
  "7",
  "8",
  "9",
  "×",
  "4",
  "5",
  "6",
  "−",
  "1",
  "2",
  "3",
  "+",
  "0",
  ".",
  "Ans",
  "=",
];
const KEY_MAP: Record<string, string> = {
  "*": "×",
  "/": "÷",
  "-": "−",
  Enter: "=",
  Backspace: "⌫",
  Delete: "C",
};
const SPOT = "claro-calculator-position";

/**
 * Keeps a saved or dragged spot fully on screen. A spot saved on a wider
 * window (or dragged past the edge) would otherwise open the panel off-screen,
 * so the toolbar button looked like it did nothing. Returns null for junk.
 */
export function clampSpot(
  spot: unknown,
  size: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number } | null {
  if (!spot || typeof spot !== "object") return null;
  const { x, y } = spot as { x?: unknown; y?: unknown };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const fit = (v: number, room: number) =>
    Math.min(Math.max(0, v), Math.max(0, room));
  return {
    x: fit(x as number, view.width - size.width),
    y: fit(y as number, view.height - size.height),
  };
}

function readSpot(): unknown {
  try {
    return JSON.parse(localStorage.getItem(SPOT) ?? "null");
  } catch {
    return null;
  }
}

/** §2.2: floating, draggable calculator with a safe parser. Esc closes. */
export function Calculator({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState("");
  const [last, setLast] = useState<{ expr: string; result: string } | null>(
    null,
  );
  const [ans, setAns] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = panel.current!;
    const spot = clampSpot(readSpot(), el.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    if (spot)
      Object.assign(el.style, {
        left: `${spot.x}px`,
        top: `${spot.y}px`,
        right: "auto",
      });
    el.focus();
  }, []);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    // Esc closes from anywhere, unless an open dialog (booklet, shortcuts) owns it.
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key !== "Escape" ||
        e.isComposing ||
        e.defaultPrevented ||
        document.querySelector('[data-slot="dialog-content"]')
      )
        return;
      close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function press(key: string) {
    if (key === "C") return setExpr("");
    if (key === "⌫") return setExpr((e) => e.replace(/(Ans|.)$/, ""));
    if (key === "±")
      return setExpr((e) => (e.startsWith("−") ? e.slice(1) : `−${e}`));
    if (key === "=") {
      try {
        const v = calculate(expr, ans);
        setLast({ expr, result: String(v) });
        setAns(v);
        setExpr(String(v));
      } catch (e) {
        setLast({ expr, result: (e as Error).message });
      }
      return;
    }
    setExpr((e) => e + key);
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Calculator"
      tabIndex={-1}
      className="bg-card fixed top-20 right-6 z-50 w-[260px] rounded-xl border p-3 shadow-lg outline-none"
      onKeyDown={(e) => {
        const key = KEY_MAP[e.key] ?? e.key;
        if (
          KEYS.includes(key) &&
          !(e.target instanceof HTMLButtonElement && e.key === "Enter")
        ) {
          e.preventDefault();
          e.stopPropagation();
          press(key);
        }
      }}
    >
      <div
        className="mb-2 flex cursor-move items-center justify-between text-sm font-semibold select-none"
        onPointerDown={(e) => {
          // Capturing a press on the close button would retarget its click to this bar.
          if ((e.target as Element).closest("button")) return;
          const r = panel.current!.getBoundingClientRect();
          drag.current = { x: e.clientX - r.left, y: e.clientY - r.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const el = panel.current!;
          const spot = clampSpot(
            { x: e.clientX - drag.current.x, y: e.clientY - drag.current.y },
            el.getBoundingClientRect(),
            { width: window.innerWidth, height: window.innerHeight },
          )!;
          Object.assign(el.style, {
            left: `${spot.x}px`,
            top: `${spot.y}px`,
            right: "auto",
          });
        }}
        onPointerUp={() => {
          if (!drag.current) return;
          drag.current = null;
          const r = panel.current!.getBoundingClientRect();
          localStorage.setItem(SPOT, JSON.stringify({ x: r.left, y: r.top }));
        }}
      >
        Calculator
        <button type="button" aria-label="Close calculator" onClick={onClose}>
          <Close className="size-4" />
        </button>
      </div>
      <div className="bg-muted mb-2 rounded-lg px-3 py-2 text-right tabular-nums">
        <p className="text-muted-foreground h-4 truncate text-xs">
          {last && `${last.expr} = ${last.result}`}
        </p>
        <p
          aria-live="polite"
          aria-label="Calculator display"
          className="truncate text-lg font-semibold"
        >
          {expr || "0"}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={cn(
              "hover:bg-muted h-9 rounded-lg border text-sm font-medium",
              k === "=" && "bg-ink border-ink hover:bg-ink/90 text-surface",
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
