import type { ReactNode } from "react";
import Link from "next/link";
import type { MarkingSheet } from "@/lib/marking-sheet";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { buttonVariants } from "./ui/button";

/**
 * Shared blocking presentation while a marking submission is pending.
 * Split into small presentational parts (layout, progress art, message) so a
 * redesign can swap one without touching callers. Markup is unchanged.
 */
export function MarkingScreen({
  single = false,
  sheet,
  title,
}: {
  single?: boolean;
  /** A sprint's answers, from the runner. Without it the screen stays generic. */
  sheet?: MarkingSheet;
  title?: string;
}) {
  if (sheet && sheet.total > 0)
    return (
      <MarkingLayout wide>
        <Logo height={32} />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Marking your answers</h1>
          <p className="text-muted-foreground text-sm">
            {[title, `${sheet.total} questions`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <AnswerSheet sheet={sheet} />
        <MarkedBar marked={sheet.marked} total={sheet.total} />
        <LeaveCard title={title} marked={sheet.marked} total={sheet.total} />
      </MarkingLayout>
    );
  return (
    <MarkingLayout>
      <Logo height={32} />
      <MarkingProgressArt />
      <MarkingMessage single={single} />
    </MarkingLayout>
  );
}

/** Full-screen blocking overlay and centred column. */
export function MarkingLayout({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="bg-background fixed inset-0 z-[100] grid min-h-dvh place-items-center overflow-y-auto p-6"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={cn(
          "mx-auto flex flex-col items-center gap-6 text-center",
          wide ? "w-full max-w-xl" : "max-w-md",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Animated ruled page with pen marks: the progress illustration. */
export function MarkingProgressArt() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 144"
      fill="none"
      className="h-36 w-52"
    >
      <rect
        x="24"
        y="8"
        width="152"
        height="128"
        rx="16"
        className="fill-card stroke-border"
      />
      <path
        d="M48 8v128M24 40h152M24 72h152M24 104h152"
        className="stroke-border"
      />
      <path
        d="M64 32h72M64 64h48M64 96h64"
        className="stroke-muted-foreground/40"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g
        className="pen-mark stroke-brand"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path pathLength="1" d="m144 56 7 8 13-20" />
        <path pathLength="1" d="M64 108q30 5 64-1" />
        <path pathLength="1" d="m144 88 7 8 13-20" />
      </g>
    </svg>
  );
}

/** Heading, explanation and what happens next. */
export function MarkingMessage({ single }: { single: boolean }) {
  return (
    <>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">
          {single ? "Marking your answer" : "Marking your answers"}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {single
            ? "We’re checking your answer against the guidelines and preparing your feedback."
            : "We’re checking your answers and preparing your feedback."}{" "}
          This can take a little while.
        </p>
      </div>
      <p className="text-muted-foreground text-xs">
        Your results will open here when ready.
      </p>
    </>
  );
}

/** The sprint's questions on a page ruled like the answer box. */
export function AnswerSheet({ sheet }: { sheet: MarkingSheet }) {
  return (
    <ol
      aria-label="Answer sheet"
      className="marking-sheet bg-card w-full rounded-2xl border text-left text-sm"
    >
      {sheet.rows.map((row) => {
        const done = row.marked === row.total;
        return (
          <li key={row.key} className="marking-sheet-row">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{row.label}</span>
              <span
                className={cn(
                  "shrink-0 text-xs",
                  done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {done ? (
                  <span className="inline-flex items-center gap-1">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="stroke-brand size-3.5"
                      fill="none"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m3 8.5 3 3 7-7" />
                    </svg>
                    Marked
                  </span>
                ) : row.total > 1 && row.marked > 0 ? (
                  `${row.marked} of ${row.total} marked`
                ) : (
                  "Waiting"
                )}
              </span>
            </div>
            <p className="text-muted-foreground">{row.detail}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** Real progress: answers whose marks are saved, out of the whole sprint. */
export function MarkedBar({
  marked,
  total,
}: {
  marked: number;
  total: number;
}) {
  const pct = total ? Math.round((marked / total) * 100) : 0;
  return (
    <div className="w-full space-y-2 text-left">
      <div
        role="progressbar"
        aria-label="Answers marked"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={marked}
        className="bg-foreground/10 h-1.5 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-brand h-full rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm font-semibold">
        {marked} of {total} marked
      </p>
    </div>
  );
}

/** Marking runs on the server, so the student is free to go. */
export function LeaveCard({
  title,
  marked,
  total,
}: {
  title?: string;
  marked: number;
  total: number;
}) {
  return (
    <section
      aria-label="You can leave this page"
      className="bg-card w-full space-y-4 rounded-2xl border p-5 text-left"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">You can leave this page</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Marking carries on without you. Until it’s done, this sprint shows as
          in progress on Activity, and your results open from there.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <span className="min-w-0 truncate text-sm font-semibold">
          {title ?? "Topic Sprint"}
        </span>
        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2.5 py-0.5 text-xs">
          In progress · {marked} of {total}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Link
          href="/student/activity"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Go to Activity
        </Link>
        <Link
          href="/student"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Back to Home
        </Link>
      </div>
    </section>
  );
}
