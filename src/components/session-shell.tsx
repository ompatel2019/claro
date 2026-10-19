"use client";
import { useEffect, useRef, useState } from "react";
import {
  PortalIcon,
  Book,
  Calculator as CalculatorIcon,
  Message,
  More,
  PanelLeft,
} from "@/components/icons";
import { toast } from "sonner";
import { FocusBar } from "@/components/claro/layout";
import { timer } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { Calculator } from "./calculator";
import { useFeedback } from "./feedback-widget";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";

export type SaveState = "saved" | "saving" | "error";
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  !!t.closest(
    "input:not([type=radio]), textarea, select, [contenteditable], [role=dialog], [role=menu]",
  );

const SHORTCUTS = [
  ["← / → or J / K", "Previous / next question"],
  ["1–4 / A–D", "Choose a multiple-choice option"],
  ["F", "Flag for review"],
  ["B", "Booklet (on multiple choice, B picks option B)"],
  ["C", "Calculator (on multiple choice, C picks option C)"],
  ["?", "Shortcuts"],
  ["Esc", "Close"],
];

/** Countdown (amber ≤5:00, red ≤1:00, then "+m:ss over") or a muted count-up. Click hides the digits. */
function Timer({ mode, seconds }: { mode: "down" | "up"; seconds: number }) {
  const [hidden, setHidden] = useState(false);
  const prev = useRef(seconds);
  useEffect(() => {
    if (mode === "down")
      for (const m of [10, 5, 1])
        if (prev.current > m * 60 && seconds <= m * 60)
          toast(`${m} ${m === 1 ? "minute" : "minutes"} left`);
    prev.current = seconds;
  }, [mode, seconds]);
  const over = mode === "down" && seconds < 0;
  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      aria-label={
        hidden
          ? "Show timer"
          : mode === "down"
            ? over
              ? `${timer(-seconds)} over time`
              : `Time remaining ${timer(seconds)}`
            : `Time used ${timer(seconds)}`
      }
      className={cn(
        "bg-card inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-sans text-[13px] tabular-nums",
        mode === "up" && "text-muted-foreground",
        mode === "down" && seconds <= 300 && "bg-warning-soft text-warning",
        mode === "down" &&
          seconds <= 60 &&
          "bg-destructive-soft text-destructive",
      )}
    >
      <PortalIcon name="timer" className="size-3.5" aria-hidden />
      {hidden
        ? "Show timer"
        : over
          ? `+${timer(-seconds)} over`
          : timer(Math.abs(seconds))}
    </button>
  );
}

type SessionProps = {
  title: string;
  flashcards?: { known: number; shortcuts: string[][] };
  position: number;
  total: number;
  answered: number;
  saveState: SaveState;
  onRetry: () => void;
  clock: { mode: "down" | "up"; seconds: number };
  busy?: boolean;
  wide?: boolean;
  onExit: () => void;
  onFinish: () => void;
  onMove: (delta: number) => void;
  booklet: React.ReactNode;
  children: React.ReactNode;
};
export function SessionShell(props: SessionProps) {
  const {
    title,
    flashcards,
    position,
    total,
    answered,
    saveState,
    onRetry,
    clock,
    busy,
    wide,
    onExit,
    onFinish,
    onMove,
    booklet,
    children,
  } = props;
  const [rail, setRail] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [calc, setCalc] = useState(false);
  const [help, setHelp] = useState(false);
  const feedback = useFeedback();
  const move = useRef(onMove);
  useEffect(() => {
    move.current = onMove;
  });
  function toggleBooklet() {
    if (window.matchMedia("(min-width: 768px)").matches) setRail((r) => !r);
    else setSheet((s) => !s);
  }
  const toggleRef = useRef(toggleBooklet);
  useEffect(() => {
    toggleRef.current = toggleBooklet;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isTyping(e.target)
      )
        return;
      const k = e.key;
      if (k === "ArrowLeft" || (!flashcards && (k === "j" || k === "J")))
        move.current(-1);
      else if (k === "ArrowRight" || (!flashcards && (k === "k" || k === "K")))
        move.current(1);
      else if (!flashcards && (k === "b" || k === "B")) toggleRef.current();
      else if (!flashcards && (k === "c" || k === "C")) setCalc((c) => !c);
      else if (k === "?") setHelp(true);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flashcards]);

  return (
    <div className="flex min-h-svh flex-col">
      <FocusBar className="bg-card/90 sticky top-0 z-30 flex h-[68px] items-center gap-1.5 border-b px-2 backdrop-blur sm:gap-4 sm:px-8">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Save and exit"
          disabled={busy}
          onClick={onExit}
        >
          <PortalIcon name="arrow-left" aria-hidden className="size-4" />
          <span className="sm:hidden">Exit</span>
          <span className="hidden sm:inline">Save and exit</span>
        </Button>
        <div className="min-w-0 flex-1 sm:border-l sm:pl-4">
          <p className="hidden truncate text-sm font-semibold md:block">
            {title}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex min-w-14 flex-col gap-1 sm:min-w-24">
              <p className="text-muted-foreground text-xs font-medium tabular-nums">
                {flashcards ? "Card" : "Q"} {position} of {total}
              </p>
              <div
                role="progressbar"
                aria-label="Answered"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={answered}
                className={
                  flashcards
                    ? "bg-muted h-1 overflow-hidden rounded-full"
                    : "sr-only"
                }
              >
                <div
                  className="bg-ink h-full transition-[width]"
                  style={{ width: `${(answered / Math.max(total, 1)) * 100}%` }}
                />
              </div>
            </div>
            {flashcards && (
              <p className="text-xs tabular-nums">Knew {flashcards.known}</p>
            )}
            <p
              role="status"
              className={cn(
                "hidden items-center gap-1 text-xs sm:flex",
                saveState === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {saveState === "saved"
                ? "Saved"
                : saveState === "saving"
                  ? "Saving…"
                  : "Not saved. Retrying"}
              {saveState === "error" && (
                <button type="button" className="underline" onClick={onRetry}>
                  Retry
                </button>
              )}
            </p>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!flashcards && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden sm:inline-flex"
                aria-label="Booklet (B)"
                onClick={toggleBooklet}
              >
                <Book />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden sm:inline-flex"
                aria-label="Calculator (C)"
                aria-pressed={calc}
                onClick={() => setCalc(!calc)}
              >
                <CalculatorIcon />
              </Button>
            </>
          )}
          <Timer {...clock} />
          {/* Below sm the tools collapse into one menu so Finish always fits; it sits beside Finish so the menu opens under its own button. */}
          {!flashcards && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="hover:bg-muted inline-flex size-8 items-center justify-center rounded-full sm:hidden"
                aria-label="More tools"
              >
                <More className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={toggleBooklet}>
                  <Book />
                  Booklet
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCalc(!calc)}>
                  <CalculatorIcon />
                  Calculator
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => feedback()}>
                  <Message />
                  Send feedback
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            aria-label="Send feedback"
            onClick={() => feedback()}
          >
            <Message />
          </Button>
          <Button
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={onFinish}
          >
            Finish
          </Button>
        </div>
      </FocusBar>
      <div className="flex flex-1">
        {!flashcards && rail && (
          <aside className="bg-card sticky top-[68px] hidden h-[calc(100svh-68px)] w-[272px] shrink-0 overflow-y-auto border-r p-5 md:block">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Booklet</h2>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Hide booklet"
                onClick={() => setRail(false)}
              >
                <PanelLeft />
              </Button>
            </div>
            {booklet}
          </aside>
        )}
        <main
          id="main"
          className={cn(
            "mx-auto w-full max-w-[824px] min-w-0 flex-1 space-y-5 px-4 py-6 sm:px-8 sm:py-10",
            wide && "max-w-7xl",
          )}
        >
          {children}
        </main>
      </div>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" className="w-72 overflow-y-auto p-4">
          <SheetTitle>Booklet</SheetTitle>
          <div
            onClick={(e) =>
              (e.target as HTMLElement).closest("[data-q]") && setSheet(false)
            }
          >
            {booklet}
          </div>
        </SheetContent>
      </Sheet>
      {calc && <Calculator onClose={() => setCalc(false)} />}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {(flashcards?.shortcuts ?? SHORTCUTS).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-sans font-semibold">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
