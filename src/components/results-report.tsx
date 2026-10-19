import Link from "next/link";
import type { ReviewRow } from "@/lib/feedback";
import { markingState, markLabel } from "@/lib/feedback";
import {
  below,
  firstBelow,
  scored,
  markTone,
  TYPE_LABEL,
  type McGridRow,
  type NextAction,
} from "@/lib/results";
import { QuestionView } from "./question-view";
import { Badge } from "./claro/controls";
import { PenTick, PenCaret } from "./claro/markup-answer";
import { AnnotatedFeedback } from "./annotated-feedback";
import { ReportProblem } from "./feedback-widget";
import { QuestionMark } from "./question-mark";
import { McReview } from "./mc-review";
import { ResultsBrowser } from "./results-browser";
import { statePill } from "./status-pill";
import { buttonVariants } from "./ui/button";
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
}: {
  rows: ReviewRow[];
  id: string;
  name: (id: string | null) => string;
  photos: Map<string | null, string | null>;
  mcGrid?: McGridRow[];
  readOnly?: boolean;
  writtenAction?: (row: ReviewRow) => React.ReactNode;
  singleResult?: boolean;
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
      <Card key={r.attempt_id} id={`q-${r.position}`}>
        <CardHeader className="space-y-2">
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">Question {r.position}</Badge>
            <Badge variant="secondary">{TYPE_LABEL[r.type]}</Badge>
            <span>{r.source}</span>
            {r.topic_id && ` · ${name(r.topic_id)}`}
            {r.type === "mcq" && scored(r) && (
              <span className="text-ink font-semibold tabular-nums">
                {markLabel(r)}
              </span>
            )}
          </p>
          <QuestionView question={r} />
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
      <ResultsBrowser
        initial={firstBelow(rows)}
        views={views}
        mcGrid={mcGrid}
        items={rows.map((r) => {
          const state = markingState(r);
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
            tone: scored(r)
              ? markTone(r.mark ?? 0, r.max_marks ?? r.marks)
              : "",
            pill: r.type === "mcq" ? null : statePill(state, r.review),
          };
        })}
      />
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
  actions,
  rows = [],
}: {
  summary: OverallSummary | null;
  pending: boolean;
  actions?: NextAction[];
  rows?: ReviewRow[];
}) {
  const actionLinks = actions && actions.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <div key={a.href} className="space-y-2">
          <Link
            href={a.href}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className:
                "h-auto min-h-9 max-w-full shrink py-1.5 text-left whitespace-normal",
            })}
          >
            {a.label}
          </Link>
          {!!a.questions?.length && (
            <div className="flex flex-wrap gap-2">
              {a.questions.map((q) => (
                <a
                  key={q.position}
                  href={`#q-${q.position}`}
                  className="text-sm underline underline-offset-4"
                >
                  Review Q{q.position} · {TYPE_LABEL[q.type]}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
  const references = (lost: boolean) => {
    const questions = rows.filter((r) =>
      lost ? below(r) : scored(r) && !below(r),
    );
    return (
      questions.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {lost ? "Marks to recover" : "Full-mark answers"}
          </p>
          <div className="flex flex-wrap gap-2">
            {questions.map((r) => (
              <a
                key={r.position}
                href={`#q-${r.position}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Q{r.position} · {TYPE_LABEL[r.type]}
              </a>
            ))}
          </div>
        </div>
      )
    );
  };
  return (
    <section
      aria-label="Overall feedback"
      className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
    >
      <h2 className="sr-only">Overall feedback</h2>
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
            {actionLinks}
          </section>
          {references(true)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Strengths and fixes</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {summary ? (
            <div className="grid gap-5">
              {(
                [
                  ["Strengths", summary.strengths, false],
                  [
                    "Top fixes",
                    summary.top_fixes ?? summary.improvements,
                    true,
                  ],
                ] as const
              ).map(([label, lines, lost]) => (
                <section key={label} className="space-y-2">
                  <h3
                    className={
                      lost
                        ? "text-warning-text text-xs font-semibold"
                        : "text-success text-xs font-semibold"
                    }
                  >
                    {label}
                  </h3>
                  <ul className="space-y-2 text-[13px]">
                    {(lines ?? []).map((text, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {lost ? (
                          <PenCaret className="mt-0.5 shrink-0" />
                        ) : (
                          <PenTick className="mt-0.5 shrink-0" />
                        )}
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {references(false)}
            </div>
          ) : (
            <div className="space-y-3">
              <p role="status" className="text-muted-foreground text-[13px]">
                {pending
                  ? "Your overall feedback will appear here once marking finishes."
                  : "An overall summary isn’t available for this sprint. Each answer’s feedback is below."}
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
