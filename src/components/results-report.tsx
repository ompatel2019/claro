import type { ReviewRow } from "@/lib/feedback";
import { markingState, markLabel } from "@/lib/feedback";
import {
  firstBelow,
  scored,
  markTone,
  TYPE_LABEL,
  type McGridRow,
} from "@/lib/results";
import { summaryView } from "@/lib/results-summary";
import { answerPillState } from "@/lib/answer-pill";
import { PortalIcon } from "./icons";
import { QuestionView } from "./question-view";
import { Badge } from "./claro/controls";
import { PenTick, PenCaret } from "./claro/markup-answer";
import { AnnotatedFeedback } from "./annotated-feedback";
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
  const views = rows.map((r) => {
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
          initial={firstBelow(rows)}
          views={views}
          mcGrid={mcGrid}
          items={rows.map((r) => {
            // MC marking stores a null choice without a "No answer" note.
            const state =
              r.type === "mcq" && r.choice_index == null
                ? "not_answered"
                : markingState(r);
            return {
              position: r.position,
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
                answered: state !== "not_answered",
                scored: scored(r),
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
  // Stored summaries can carry meta lines; the sprint page shows the next step on its own.
  const view = summaryView(summary, { withoutStep: hideNextStep });
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
              <>
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
              </>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Strengths and fixes</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {summary ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {(
                [
                  ["Strengths", view.strengths, false],
                  ["Top fixes", view.fixes, true],
                ] as const
              ).map(([label, lines, lost]) => (
                <section key={label} className="space-y-2">
                  <h3
                    className={
                      hideNextStep
                        ? "text-ink-2 flex items-center gap-1.5 text-xs font-semibold"
                        : lost
                          ? "text-destructive flex items-center gap-1.5 text-xs font-semibold"
                          : "text-success flex items-center gap-1.5 text-xs font-semibold"
                    }
                  >
                    <PortalIcon
                      name={lost ? "circle-alert" : "circle-check"}
                      className="size-3.5"
                    />
                    {label}
                  </h3>
                  <ul className="space-y-2 text-[13px]">
                    {lines.map((text, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {!hideNextStep ? (
                          lost ? (
                            <PenCaret className="text-destructive mt-0.5 shrink-0" />
                          ) : (
                            <PenTick className="text-success mt-0.5 shrink-0" />
                          )
                        ) : lost ? (
                          <PortalIcon
                            name="arrow-right"
                            className="text-muted-foreground mt-0.5 size-4 shrink-0"
                          />
                        ) : (
                          <PortalIcon
                            name="check"
                            className="text-success mt-0.5 size-4 shrink-0"
                          />
                        )}
                        <span>
                          {text.split(/(\bQ\d+\b)/g).map((part, index) =>
                            /^Q\d+$/.test(part) ? (
                              <a
                                key={index}
                                href={`#q-${part.slice(1)}`}
                                className="font-medium underline underline-offset-4"
                              >
                                {part}
                              </a>
                            ) : (
                              part
                            ),
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p role="status" className="text-muted-foreground text-[13px]">
                {pending
                  ? "Your overall feedback will appear here once marking finishes."
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
        </CardContent>
      </Card>
    </section>
  );
}
