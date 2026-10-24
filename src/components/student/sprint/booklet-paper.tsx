"use client";
import { useEffect, useRef } from "react";
import { Flag, PortalIcon } from "@/components/icons";
import { RichText } from "@/components/rich-text";
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

/**
 * Read-only paper of every question, shown in the sprint's booklet sidebar.
 * Exam mode never shows awarded marks.
 */
export function BookletPaper({
  attempts,
  index,
  examMode,
  busy = false,
  onJump,
}: {
  attempts: Attempt[];
  index: number;
  examMode: boolean;
  busy?: boolean;
  onJump: (i: number) => void;
}) {
  // Keep the current question in view so a long paper follows the student.
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [index]);
  return (
    <nav aria-label="Question booklet">
      <ol className="divide-y">
        {attempts.map((a, i) => {
          const current = i === index;
          const state = trackerState(a, current);
          const text = preview(a);
          const marked = !examMode && a.status === "marked";
          return (
            <li
              key={a.id}
              ref={current ? currentRef : undefined}
              data-state={state}
              className={cn(
                "relative flex gap-3 px-4 py-3.5 transition-colors",
                current ? "bg-selected" : "hover:bg-accent",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                  TRACKER_STATE[state],
                )}
              >
                {i + 1}
                {a.flagged && (
                  <span
                    data-flag
                    className={cn(
                      "ring-background absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2",
                      TRACKER_STATE.flag,
                    )}
                  />
                )}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <button
                    type="button"
                    data-q
                    disabled={busy}
                    aria-current={current ? "step" : undefined}
                    aria-label={`Question ${i + 1}: ${answered(a) ? "Answered" : "Not answered"}${a.flagged ? ", Flagged" : ""}${marked ? `, ${a.mark}/${a.max_marks ?? a.question.marks} marks` : ""}`}
                    onClick={() => onJump(i)}
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
                  {a.flagged && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-ink-2 inline-flex items-center gap-1 font-medium">
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
                  className="text-foreground line-clamp-2 text-[13px] leading-5"
                  text={a.question.stem}
                />
                {text ? (
                  <p className="line-clamp-2 text-[13px] leading-5">
                    <span className="text-muted-foreground">Your answer: </span>
                    <span className="text-foreground break-words">{text}</span>
                  </p>
                ) : (
                  <p className="text-muted-foreground text-[13px] leading-5">
                    Not answered
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
