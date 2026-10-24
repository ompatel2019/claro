import type { ReviewRow } from "@/lib/feedback";
import { markingState, markLabel } from "@/lib/feedback";
import {
  firstBelow,
  scored,
  markTone,
  TYPE_LABEL,
  type McGridRow,
} from "@/lib/results";
import { questionRefs, summaryView } from "@/lib/results-summary";
import { answerPillState } from "@/lib/answer-pill";
import { firstLost } from "@/lib/results-stats";
import { formatSampleMaths } from "@/lib/sample-maths";
import Link from "next/link";
import { buttonVariants } from "./ui/button";
import { cn } from "@/lib/utils";
import { PortalIcon } from "./icons";
import { QuestionView } from "./question-view";
import { Badge } from "./claro/controls";
import { AnnotatedFeedback } from "./annotated-feedback";
import { RichText } from "./rich-text";
import { AI_NOTE } from "./annotated-feedback/ai-note";
import { ReportProblem } from "./feedback-widget";
import { QuestionMark } from "./question-mark";
import { McReview } from "./mc-review";
import { ResultsBrowser } from "./results-browser";
import { statePill } from "./status-pill";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/** Results composition for sprint and single-answer pages, using the existing kit. */
export function ResultsAnswers({
  rows,
  id,
  name,
  photos,
  mcGrid,
  readOnly = false,
  writtenAction,
  singleResult = false,
  sprintLayout = false,
  cards = {},
}: {
  rows: ReviewRow[];
  id: string;
  name: (id: string | null) => string;
  photos: Map<string | null, string | null>;
  mcGrid?: McGridRow[];
  readOnly?: boolean;
  writtenAction?: (row: ReviewRow) => React.ReactNode;
  singleResult?: boolean;
  sprintLayout?: boolean;
  /** Flashcard counts by topic, for the sprint actions row. */
  cards?: Record<string, number>;
}) {
  const report = (r: ReviewRow) =>
    !readOnly &&
    r.question_id && (
      <ReportProblem
        questionId={r.question_id}
        sessionId={id}
        label={`Linked: ${r.source}`}
      />
    );
  if (singleResult && rows.length === 1 && rows[0].type !== "mcq") {
    const r = rows[0];
    return (
      <AnnotatedFeedback
        singleResult
        row={r}
        readOnly={readOnly}
        photos={(r.image_paths ?? []).flatMap((p) => photos.get(p) ?? [])}
        actions={
          writtenAction ? (
            writtenAction(r)
          ) : (
            <>
              {!readOnly &&
                ["marked", "reviewed"].includes(markingState(r)) && (
                  <QuestionMark attemptId={r.attempt_id} />
                )}
              {report(r)}
            </>
          )
        }
      />
    );
  }
  const sprintView = (r: ReviewRow) => {
    const sample = r.type !== "mcq" && r.sample_answer;
    const header = (
      <div className="space-y-3">
        <p className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">Question {r.position}</Badge>
          <Badge variant="secondary">
            {r.marks} {r.marks === 1 ? "mark" : "marks"}
          </Badge>
          {r.topic_id && <Badge variant="secondary">{name(r.topic_id)}</Badge>}
          {r.type === "mcq" && scored(r) && (
            <span className="text-ink ml-1 text-sm font-semibold tabular-nums">
              {markLabel(r)}
            </span>
          )}
        </p>
        <div className="[&>div>div:first-child]:text-[17px]">
          <QuestionView question={r} showMetadata={readOnly} />
        </div>
      </div>
    );
    const full = sample && (
      <details className="group border-t pt-3">
        <summary className="flex h-9 w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          Full-marks answer
          <PortalIcon
            name="chevron-down"
            aria-hidden
            className="text-muted-foreground size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <RichText
          className="text-ink-2 mt-1 max-w-prose text-[15px] leading-relaxed"
          text={formatSampleMaths(sample)}
        />
      </details>
    );
    if (r.type !== "mcq")
      // Written: the marked answer draws the question card (header, marks, answer) and its
      // comments sit beside it on the canvas, so no host card here.
      return (
        <div
          key={r.attempt_id}
          id={`q-${r.position}`}
          className="scroll-mt-20 [--cma-sticky-top:72px]"
        >
          <AnnotatedFeedback
            readOnly={readOnly}
            aiNote={false}
            bare
            commentColumn
            showReferences={false}
            row={r}
            photos={(r.image_paths ?? []).flatMap((p) => photos.get(p) ?? [])}
            lead={header}
            tail={full || undefined}
          />
        </div>
      );
    return (
      <div key={r.attempt_id} className="space-y-4">
        <Card
          id={`q-${r.position}`}
          className="scroll-mt-20 overflow-visible [--cma-sticky-top:72px]"
        >
          <CardHeader className="space-y-3">{header}</CardHeader>
          <CardContent className="space-y-4">
            <McReview row={r} />
          </CardContent>
        </Card>
      </div>
    );
  };
  const sprintActions = (r: ReviewRow) => {
    const state = markingState(r);
    return (
      !readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {r.topic_id && (
            <Link
              href={`/student/sprint?type=${r.type}&sub=${encodeURIComponent(r.topic_id)}`}
              className={buttonVariants()}
            >
              <PortalIcon name="pen-line" aria-hidden className="size-4" />
              Practise a similar question
            </Link>
          )}
          {r.topic_id && !!cards[r.topic_id] && (
            <Link
              href={`/student/flashcards?topic=${encodeURIComponent(r.topic_id)}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <PortalIcon name="copy" aria-hidden className="size-4" />
              {name(r.topic_id)} flashcards
            </Link>
          )}
          <span className="hidden flex-1 sm:block" />
          {r.type !== "mcq" && ["marked", "reviewed"].includes(state) && (
            <QuestionMark attemptId={r.attempt_id} quiet />
          )}
          {r.question_id && (
            <ReportProblem
              quiet
              questionId={r.question_id}
              sessionId={id}
              label={`Linked: ${r.source}`}
            />
          )}
        </div>
      )
    );
  };
  const views = rows.map((r) => {
    if (sprintLayout) return sprintView(r);
    const state = markingState(r);
    return (
      <Card
        key={r.attempt_id}
        id={`q-${r.position}`}
        className="scroll-mt-20 overflow-visible [--cma-sticky-top:72px]"
      >
        <CardHeader className="space-y-2">
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">Question {r.position}</Badge>
            <Badge variant="secondary">{TYPE_LABEL[r.type]}</Badge>
            <span className="text-xs">
              {name(r.topic_id)} · {r.marks} {r.marks === 1 ? "mark" : "marks"}
            </span>
            {r.type === "mcq" && scored(r) && (
              <span className="text-ink font-semibold tabular-nums">
                {markLabel(r)}
              </span>
            )}
          </p>
          <div
            className={
              readOnly ? undefined : "[&>div>div:first-child]:text-[17px]"
            }
          >
            <QuestionView question={r} showMetadata={readOnly} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {r.type === "mcq" ? (
            <>
              <McReview row={r} />
              {report(r)}
            </>
          ) : (
            <AnnotatedFeedback
              readOnly={readOnly}
              aiNote={false}
              flush
              row={r}
              photos={(r.image_paths ?? []).flatMap((p) => photos.get(p) ?? [])}
              actions={
                writtenAction ? (
                  writtenAction(r)
                ) : (
                  <>
                    {!readOnly && ["marked", "reviewed"].includes(state) && (
                      <QuestionMark attemptId={r.attempt_id} />
                    )}
                    {report(r)}
                  </>
                )
              }
            />
          )}
        </CardContent>
      </Card>
    );
  });

  return (
    rows.length > 0 && (
      <>
        <ResultsBrowser
          sprintLayout={sprintLayout}
          initial={sprintLayout ? firstLost(rows) : firstBelow(rows)}
          views={views}
          actions={sprintLayout ? rows.map(sprintActions) : undefined}
          mcGrid={mcGrid}
          items={rows.map((r) => {
            // MC marking stores a null choice without a "No answer" note.
            const state =
              r.type === "mcq" && r.choice_index == null
                ? "not_answered"
                : markingState(r);
            return {
              position: r.position,
              flagged: r.flagged,
              type: TYPE_LABEL[r.type],
              topic: name(r.topic_id),
              source: r.source,
              mark: scored(r)
                ? markLabel(r)
                : r.feedback?.confidence === "low"
                  ? "Needs review"
                  : r.status === "marked" && r.mark == null
                    ? "No mark available"
                    : null,
              tone:
                state === "not_answered"
                  ? "bg-card border-muted-foreground/45 border-dashed text-muted-foreground"
                  : scored(r)
                    ? markTone(r.mark ?? 0, r.max_marks ?? r.marks)
                    : "",
              state: answerPillState({
                mark: r.mark,
                max: r.max_marks ?? r.marks,
                answered: !["not_answered", "skipped"].includes(state),
                scored: scored(r),
                marking: state === "marking",
              }),
              pill:
                r.type === "mcq" && state !== "not_answered"
                  ? null
                  : statePill(state, r.review),
            };
          })}
        />
        {rows.some((r) => r.type !== "mcq") && (
          <p className="text-muted-foreground mt-4 text-xs">{AI_NOTE}</p>
        )}
      </>
    )
  );
}

export type OverallSummary = {
  strengths?: string[];
  improvements?: string[];
  top_fixes?: string[];
  next_steps?: string[];
};
export function OverallFeedback({
  summary,
  pending,
  nextStep,
  hideNextStep = false,
}: {
  summary: OverallSummary | null;
  pending: boolean;
  nextStep?: React.ReactNode;
  hideNextStep?: boolean;
}) {
  // Stored summaries can carry meta lines; show three of each, one line apiece.
  const view = summaryView(summary);
  return (
    <section aria-label="Overall feedback" className="grid gap-5">
      <h2 className="sr-only">Overall feedback</h2>
      {!hideNextStep && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Your next step</h2>
            </CardTitle>
            <p className="text-muted-foreground text-[13px]">
              Fix the marks you dropped while they’re fresh
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {nextStep ?? (
              <section
                className="bg-brand-soft/60 border-brand/30 space-y-3 rounded-xl border p-4"
                aria-label="Next steps"
              >
                <h3 className="text-sm font-semibold">Next steps</h3>
                {!!summary?.next_steps?.length && (
                  <ul className="space-y-2 text-[13px]">
                    {summary.next_steps.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        <h2 className="text-ink text-lg font-semibold tracking-tight">
          Strengths and fixes
        </h2>
        {hideNextStep &&
        summary &&
        !view.strengths.length &&
        !view.fixes.length ? (
          <p className="bg-card text-ink-2 shadow-card rounded-xl border p-4 text-[13px]">
            {/* The next mark lives in each question's score card, never here. */}
            No overall strengths or fixes for this sprint. Review each answer
            below.
          </p>
        ) : summary ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["Strengths", view.strengths, "check"],
                ["Fixes", view.fixes, "arrow-up-right"],
              ] as const
            ).map(([label, lines, icon]) => (
              <section
                key={label}
                aria-label={label}
                className="bg-card shadow-card min-w-0 overflow-hidden rounded-xl border"
              >
                <h3 className="text-ink flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
                  <PortalIcon
                    name={icon}
                    aria-hidden
                    className={cn(
                      "size-4",
                      label === "Strengths"
                        ? "text-success-text"
                        : "text-brand-text",
                    )}
                  />
                  {label}
                </h3>
                <ul className="divide-y">
                  {!lines.length && (
                    <li className="text-muted-foreground px-4 py-2.5 text-[13px]">
                      Nothing to add this time.
                    </li>
                  )}
                  {lines.map((text, i) => (
                    <li
                      key={i}
                      className="flex items-baseline gap-4 px-4 py-2.5 text-[13px]"
                    >
                      {/* Sprint: one line on desktop; the full text stays in the DOM for assistive tech and in the title. */}
                      <span
                        className={cn(
                          "text-ink-2 min-w-0 flex-1",
                          hideNextStep && "sm:truncate",
                        )}
                        title={text}
                      >
                        {text}
                      </span>
                      <span className="flex shrink-0 gap-2">
                        {questionRefs(text).map((n) => (
                          <a
                            key={n}
                            href={`#q-${n}`}
                            aria-label={`Go to Q${n}`}
                            className="text-brand-text font-semibold underline underline-offset-4"
                          >
                            Q{n}
                          </a>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="bg-card shadow-card space-y-3 rounded-xl border p-4">
            <p role="status" className="text-muted-foreground text-[13px]">
              {pending
                ? "Your overall feedback will appear here once marking finishes."
                : hideNextStep
                  ? "An overall summary isn’t available for this sprint. Review each answer’s feedback below."
                  : "An overall summary isn’t available for this sprint. Review each answer’s feedback above."}
            </p>
            {pending && (
              <div
                aria-hidden="true"
                className="bg-muted h-4 w-2/3 animate-pulse rounded"
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
