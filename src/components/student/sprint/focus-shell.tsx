"use client";
import { useEffect, useRef, useState, useId, type ComponentProps } from "react";
import { toast } from "sonner";
import { PortalIcon } from "@/components/icons";
import { FocusBar } from "@/components/claro/layout";
import { Calculator } from "@/components/calculator";
import { useFeedback } from "@/components/feedback-widget";
import { isTyping, type SessionShell } from "@/components/session-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { timer } from "@/lib/practice";
import { cn } from "@/lib/utils";

/** Sprint chrome is local so other focus tools keep their existing shell API. */
export function SprintFocusShell(
  props: Omit<ComponentProps<typeof SessionShell>, "flashcards" | "clock"> & {
    clock: { mode: "down" | "up"; seconds: number };
    wide?: boolean;
    booklet: React.ReactNode;
  },
) {
  const {
    title,
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
  const bookletId = useId();
  const [rail, setRail] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [calc, setCalc] = useState(false);
  const [help, setHelp] = useState(false);
  const feedback = useFeedback();
  const toggleBooklet = () =>
    window.matchMedia("(min-width: 768px)").matches
      ? setRail((r) => !r)
      : setSheet((s) => !s);
  const handlers = useRef({ onMove, toggleBooklet });
  useEffect(() => {
    handlers.current = { onMove, toggleBooklet };
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isTyping(e.target)
      )
        return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "j") handlers.current.onMove(-1);
      else if (k === "arrowright" || k === "k") handlers.current.onMove(1);
      else if (k === "b") handlers.current.toggleBooklet();
      else if (k === "c") setCalc((c) => !c);
      else if (k === "?") setHelp(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="flex min-h-svh flex-col">
      <FocusBar className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:h-[68px] md:flex-nowrap md:py-0 lg:gap-4 lg:px-8 [&>[data-component=MobileFocusFeedback]]:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-0"
          aria-label="Save and exit"
          disabled={busy}
          onClick={onExit}
        >
          <PortalIcon name="arrow-left" className="size-4" />
          Save and exit
        </Button>
        <div className="min-w-0 flex-1 sm:border-l sm:pl-4">
          <p className="truncate text-sm font-semibold">{title}</p>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
            <p className="hidden truncate sm:block">
              Question {position} of {total} · {answered} answered ·
            </p>
            <p
              role="status"
              className={cn(
                "flex shrink-0 items-center gap-1",
                saveState === "error" && "text-destructive",
              )}
            >
              {saveState !== "saving" && (
                <PortalIcon
                  name={saveState === "saved" ? "check" : "circle-alert"}
                  className="size-3"
                />
              )}
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
          <div
            className="sr-only"
            role="progressbar"
            aria-label="Answered"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={answered}
          />
        </div>
        <div className="order-last flex w-full shrink-0 flex-wrap items-center justify-between gap-1 md:order-none md:ml-auto md:w-auto md:flex-nowrap">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Booklet (B)"
            className="hidden md:inline-flex"
            aria-pressed={rail}
            title="Booklet"
            onClick={toggleBooklet}
          >
            <PortalIcon name="book-open" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Booklet (B)"
            aria-expanded={sheet}
            aria-controls={bookletId}
            onClick={() => setSheet((open) => !open)}
          >
            <PortalIcon name="book-open" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Calculator (C)"
            aria-pressed={calc}
            onClick={() => setCalc(!calc)}
          >
            <PortalIcon name="calculator" />
            Calculator
          </Button>
          <SprintTimer {...clock} />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Send feedback"
            onClick={() => feedback()}
          >
            <PortalIcon name="message-circle" />
            Send feedback
          </Button>
        </div>
        <Button size="sm" disabled={busy} onClick={onFinish}>
          Finish
        </Button>
      </FocusBar>
      <div className="flex flex-1">
        {rail && (
          <aside className="bg-card sticky top-[68px] hidden h-[calc(100svh-68px)] w-[272px] shrink-0 overflow-y-auto border-r p-5 md:block">
            <h2 className="mb-5 text-sm font-semibold">Booklet</h2>
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
        <SheetContent
          id={bookletId}
          side="left"
          className="w-72 overflow-y-auto p-4"
        >
          <SheetTitle>Booklet</SheetTitle>
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("[data-q]"))
                setSheet(false);
            }}
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
            {[
              ["← / → or J / K", "Previous / next question"],
              ["1–4 / A–D", "Choose a multiple-choice option"],
              ["F", "Flag for review"],
              ["B", "Booklet (on multiple choice, B picks option B)"],
              ["C", "Calculator (on multiple choice, C picks option C)"],
              ["?", "Shortcuts"],
              ["Esc", "Close"],
            ].map(([key, label]) => (
              <div key={key} className="contents">
                <dt className="font-semibold">{key}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SprintTimer({
  mode,
  seconds,
}: {
  mode: "down" | "up";
  seconds: number;
}) {
  const [hidden, setHidden] = useState(false);
  const previous = useRef(seconds);
  useEffect(() => {
    if (mode === "down")
      for (const minutes of [10, 5, 1])
        if (previous.current > minutes * 60 && seconds <= minutes * 60)
          toast(`${minutes} ${minutes === 1 ? "minute" : "minutes"} left`);
    previous.current = seconds;
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
        "bg-card mx-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap tabular-nums",
        mode === "up" && "text-muted-foreground",
        mode === "down" && seconds <= 300 && "bg-warning-soft text-warning",
        mode === "down" &&
          seconds <= 60 &&
          "bg-destructive-soft text-destructive",
      )}
    >
      <PortalIcon name="timer" className="size-3.5" />
      {hidden
        ? "Show timer"
        : over
          ? `+${timer(-seconds)} over`
          : timer(Math.abs(seconds))}
    </button>
  );
}
