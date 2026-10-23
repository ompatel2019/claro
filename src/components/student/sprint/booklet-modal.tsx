"use client";
import { useRef } from "react";
import { Flag, PortalIcon } from "@/components/icons";
import { RichText } from "@/components/rich-text";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { answered, plural, type Attempt } from "@/lib/practice";
import { TYPE_LABEL } from "@/lib/results";
import { cn } from "@/lib/utils";
import {
  TRACKER_STATE,
  type TrackerState,
} from "@/components/sprint/tracker-state";

const LETTERS = "ABCD";
const PREVIEW = 160;

export function trackerState(a: Attempt, current: boolean): TrackerState {
  return current ? "active" : answered(a) ? "answered" : "unanswered";
}

function preview(a: Attempt) {
  if (a.question.type === "mcq") {
    if (a.choice_index == null) return null;
    const option = a.question.options?.[a.choice_index];
    return `${LETTERS[a.choice_index]}${option ? `. ${option}` : ""}`;
  }
  const text = (a.transcript ?? a.answer_text)?.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.length > PREVIEW ? `${text.slice(0, PREVIEW).trimEnd()}…` : text;
}

function Awarded({ a }: { a: Attempt }) {
  const mark = Number(a.mark ?? 0);
  const max = Number(a.max_marks ?? a.question.marks);
  const [word, tone, icon] =
    mark >= max
      ? (["Full marks", "text-success-text", "circle-check"] as const)
      : mark > 0
        ? (["Part marks", "text-warning-text", "circle-alert"] as const)
        : (["No marks", "text-destructive", "circle-alert"] as const);
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", tone)}>
      <PortalIcon name={icon} className="size-3.5" />
      <span className="tabular-nums">
        {mark}/{max}
      </span>
      {word}
    </span>
  );
}

/** Read-only paper of every question. Exam mode never shows awarded marks. */
export function BookletModal({
  open,
  onOpenChange,
  attempts,
  index,
  examMode,
  busy = false,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attempts: Attempt[];
  index: number;
  examMode: boolean;
  busy?: boolean;
  onJump: (i: number) => void;
}) {
  const done = attempts.filter(answered).length;
  // Open on the current question so a long paper starts where the student is.
  const currentRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent
        initialFocus={currentRef}
        className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <header className="border-b px-6 pt-5 pb-4">
          <DialogTitle className="text-lg font-semibold">Booklet</DialogTitle>
          <DialogDescription className="mt-1 tabular-nums">
            {done} of {attempts.length} answered
          </DialogDescription>
        </header>
        <ol className="divide-y overflow-y-auto overscroll-contain">
          {attempts.map((a, i) => {
            const current = i === index;
            const state = trackerState(a, current);
            const text = preview(a);
            const marked = !examMode && a.status === "marked";
            return (
              <li
                key={a.id}
                data-state={state}
                className={cn(
                  "relative flex gap-4 px-6 py-4 transition-colors",
                  current ? "bg-brand-soft/40" : "hover:bg-muted/50",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "relative grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums",
                    TRACKER_STATE[state],
                  )}
                >
                  {i + 1}
                  {a.flagged && (
                    <span
                      data-flag
                      className={cn(
                        "ring-popover absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2",
                        TRACKER_STATE.flag,
                      )}
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <button
                      type="button"
                      ref={current ? currentRef : undefined}
                      disabled={busy}
                      aria-current={current ? "step" : undefined}
                      aria-label={`Question ${i + 1}: ${answered(a) ? "Answered" : "Not answered"}${a.flagged ? ", Flagged" : ""}${marked ? `, ${a.mark}/${a.max_marks ?? a.question.marks} marks` : ""}`}
                      onClick={() => {
                        onOpenChange(false);
                        onJump(i);
                      }}
                      className="text-foreground focus-visible:after:outline-ring cursor-pointer font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 disabled:cursor-not-allowed"
                    >
                      Question {i + 1}
                    </button>
                    <span aria-hidden>·</span>
                    <span>{TYPE_LABEL[a.question.type]}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {plural(a.question.marks, "mark")}
                    </span>
                    {current && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-brand-text font-medium">
                          Current
                        </span>
                      </>
                    )}
                    {a.flagged && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-foreground inline-flex items-center gap-1 font-medium">
                          <Flag className="size-3.5" /> Flagged
                        </span>
                      </>
                    )}
                    {marked && (
                      <>
                        <span aria-hidden>·</span>
                        <Awarded a={a} />
                      </>
                    )}
                  </p>
                  <RichText
                    className="text-foreground line-clamp-3 text-sm leading-[22px]"
                    text={a.question.stem}
                  />
                  {text ? (
                    <p className="text-sm">
                      <span className="text-muted-foreground">
                        Your answer:{" "}
                      </span>
                      <span className="text-foreground break-words">
                        {text}
                      </span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Not answered
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
