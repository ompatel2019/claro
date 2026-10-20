"use client";
import { useEffect, useRef, useState } from "react";
import { PortalIcon, Flag } from "@/components/icons";
import { FocusBar } from "@/components/claro/layout";
import { timer } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { useFeedback } from "./feedback-widget";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

export type SaveState = "saved" | "saving" | "error";
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  !!t.closest(
    "input:not([type=radio]), textarea, select, [contenteditable], [role=dialog], [role=menu]",
  );

/** Muted count-up. Click hides the digits. */
function Timer({ seconds }: { seconds: number }) {
  const [hidden, setHidden] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      aria-label={hidden ? "Show timer" : `Time used ${timer(seconds)}`}
      className={cn(
        "bg-card inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-sans text-[13px] tabular-nums",
        "text-muted-foreground",
      )}
    >
      <PortalIcon name="timer" className="size-3.5" aria-hidden />
      {hidden ? "Show timer" : timer(Math.abs(seconds))}
    </button>
  );
}

type SessionProps = {
  title: string;
  flashcards: { known: number; shortcuts: string[][] };
  position: number;
  total: number;
  answered: number;
  saveState: SaveState;
  onRetry: () => void;
  clock: { mode: "up"; seconds: number };
  busy?: boolean;
  onExit: () => void;
  onFinish: () => void;
  onMove: (delta: number) => void;
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
    onExit,
    onFinish,
    onMove,
    children,
  } = props;
  const [help, setHelp] = useState(false);
  const feedback = useFeedback();
  const move = useRef(onMove);
  useEffect(() => {
    move.current = onMove;
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
      if (k === "ArrowLeft") move.current(-1);
      else if (k === "ArrowRight") move.current(1);
      else if (k === "?") setHelp(true);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-svh flex-col">
      <FocusBar
        className={cn(
          "bg-card/90 sticky top-0 z-30 flex h-[68px] items-center gap-1.5 border-b px-2 backdrop-blur sm:gap-4 sm:px-8",
          "gap-3 px-3 sm:gap-3 sm:px-5 [&>[data-component=MobileFocusFeedback]]:hidden",
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          aria-label="Save and exit"
          className="text-[13px]"
          disabled={busy}
          onClick={onExit}
        >
          <PortalIcon name="arrow-left" aria-hidden className="size-4" />
          <span className="whitespace-nowrap">Save and exit</span>
        </Button>
        <div className="min-w-0 flex-1 sm:border-l sm:pl-4">
          <p
            className={cn(
              "hidden truncate text-sm font-semibold md:block",
              "block",
            )}
          >
            {title}
          </p>
          <div
            className={cn(
              "flex items-center gap-2",
              "text-muted-foreground block truncate text-xs leading-4",
            )}
          >
            <div className="inline">
              <p
                className={cn(
                  "text-muted-foreground text-xs font-medium tabular-nums",
                  "inline",
                )}
              >
                Card {position} of {total}
              </p>
              <div
                role="progressbar"
                aria-label="Answered"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={answered}
                className="sr-only"
              >
                <div
                  className="bg-ink h-full transition-[width]"
                  style={{ width: `${(answered / Math.max(total, 1)) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs tabular-nums">
              {" "}
              · <span>Knew {flashcards.known}</span> ·{" "}
            </span>
            <p
              role="status"
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                saveState === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {saveState === "saved" ? (
                <>
                  <PortalIcon name="check" className="size-3" aria-hidden />
                  Saved
                </>
              ) : saveState === "saving" ? (
                "Saving…"
              ) : (
                "Not saved. Retrying"
              )}
              {saveState === "error" && (
                <button type="button" className="underline" onClick={onRetry}>
                  Retry
                </button>
              )}
            </p>
          </div>
        </div>
        <div
          className={cn("ml-auto flex shrink-0 items-center gap-1", "gap-2")}
        >
          <Timer {...clock} />
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            aria-label="Send feedback"
            onClick={() => feedback()}
          >
            <Flag />
          </Button>
          <Button
            size="sm"
            className={cn("rounded-full", "text-[13px]")}
            disabled={busy}
            onClick={onFinish}
          >
            Finish
          </Button>
        </div>
      </FocusBar>
      <div className="flex flex-1">
        {/* Preserve the child slot so content useId values stay unchanged. */}
        {null}
        <main
          id="main"
          className={cn(
            "mx-auto w-full max-w-[824px] min-w-0 flex-1 space-y-5 px-4 py-6 sm:px-8 sm:py-10",
            "max-w-none px-4 py-8 sm:px-4 sm:py-12",
          )}
        >
          {children}
        </main>
      </div>
      {/* Preserve sibling slots for the shortcuts dialog's generated IDs. */}
      {null}
      {null}
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {flashcards.shortcuts.map(([k, v]) => (
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
