import Link from "next/link";
import { RichText } from "@/components/rich-text";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/claro/data-display";
import { PenCaret, PenTick, PenWave } from "@/components/claro/markup-answer";
import { MarkedAnswer } from "./marked-answer";
import { MarkReportProblem } from "./report-problem";
import { cn } from "@/lib/utils";
import { normaliseStem } from "@/lib/stem-text";
import { QuestionMark } from "@/components/question-mark";
import { PortalIcon } from "@/components/icons";
import {
  readComments,
  markingState,
  nextMarkLine,
  type ReviewRow,
} from "@/lib/feedback";
import { detectVerb } from "@/lib/single-check";
import { dateLabel } from "@/lib/practice";

export function SingleResult({
  row,
  sessionId,
  when,
  topic,
}: {
  row: ReviewRow;
  sessionId: string;
  when: string;
  topic: string;
}) {
  const text = row.answer_text ?? row.transcript ?? "";
  const comments = readComments(row.feedback, text);
  const score = row.mark ?? 0;
  const of = row.max_marks ?? row.marks;
  const [lead, ...rest] = normaliseStem(row.stem).split("\n");
  const provisional = markingState(row) !== "reviewed";
  const fixes = comments.filter((c) => c.kind === "fix");
  const next = nextMarkLine(comments, row.feedback, score === of);
  const nextLines = [
    ...new Set([
      ...fixes.map((c) => c.next_mark ?? c.body),
      ...(next ? [next] : []),
    ]),
  ];
  const rewrite = row.question_id
    ? `/student/mark?question=${encodeURIComponent(row.question_id)}`
    : "/student/mark";
  const verb = detectVerb(row.stem);
  const meanings: Record<string, string> = {
    explain:
      "Show cause and effect: how and why one thing leads to another, not just what happens.",
    analyse: "Identify the parts and explain how they relate to each other.",
    evaluate: "Make a judgement based on evidence and clear criteria.",
    discuss: "Identify issues and provide points for and against.",
    outline: "Give the main features in general terms.",
    describe: "Provide characteristics and features.",
    define: "State the meaning and identify essential qualities.",
  };
  const segments: {
    text: string;
    kind?: "credit" | "improve";
    note?: number;
    caret?: boolean;
  }[] = [];
  let offset = 0;
  for (const c of comments.filter((c) => c.start !== null)) {
    const start = c.start!;
    if (start < offset) continue;
    if (start > offset) segments.push({ text: text.slice(offset, start) });
    segments.push({
      text: c.quote,
      kind: c.kind === "strength" ? "credit" : "improve",
      note: c.n,
    });
    offset = start + c.quote.length;
  }
  segments.push({ text: text.slice(offset) });
  for (const c of comments.filter((c) => c.start === null))
    segments.push({ text: "", caret: c.kind === "fix", note: c.n });
  return (
    <div className="min-w-0">
      <header className="mb-6">
        <Link
          href="/student/mark"
          className="text-muted-foreground mb-3 inline-flex items-center gap-1.5 text-[13px]"
        >
          <PortalIcon name="arrow-left" className="size-3.5" />
          Mark my answer
        </Link>
        <p className="text-muted-foreground mb-1.5 text-sm">
          Marked {dateLabel(when, true)}
          {topic ? ` · ${topic}` : ""} · {of} marks
        </p>
        <h1>{lead}</h1>
        {rest.length > 0 && <RichText text={rest.join("\n")} />}
        {row.stimulus && <RichText text={row.stimulus} />}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {row.question_id && (
            <MarkReportProblem
              questionId={row.question_id}
              sessionId={sessionId}
            />
          )}
          {row.topic_id && (
            <Link
              href={`/student/sprint?type=${row.type}&sub=${encodeURIComponent(row.topic_id)}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Practise similar
            </Link>
          )}
          <Link href={rewrite} className={buttonVariants()}>
            <PortalIcon name="pen-line" />
            Rewrite answer
          </Link>
        </div>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
        <Card className="h-full xl:min-h-[318px]">
          <div className="flex items-center gap-5 px-5">
            <ScoreRing score={score} of={of} size={96} />
            <div className="min-w-0">
              <Badge variant="outline">
                {provisional && <PortalIcon name="hourglass" />}
                {provisional ? "Provisional" : "Reviewed"}
              </Badge>
              <p className="mt-2 text-sm font-semibold">
                {score === of
                  ? "Full marks"
                  : of - score === 1
                    ? "One mark from full marks"
                    : `${of - score} marks from full marks`}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[13px]">
                {provisional
                  ? "Provisional marks are a guide while you practise."
                  : "Your marking review is complete."}
              </p>
            </div>
          </div>
          {verb && meanings[verb.toLowerCase()] && (
            <div className="bg-muted mx-5 mt-auto rounded-xl px-4 py-3">
              <p className="text-xs font-semibold">
                The verb is “{verb[0].toUpperCase() + verb.slice(1)}”
              </p>
              <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
                {meanings[verb.toLowerCase()]}
              </p>
            </div>
          )}
        </Card>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Marking criteria</CardTitle>
            <CardDescription>Where your answer sits</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {row.criteria?.map((band, i) => {
                const matched = score >= band.min && score <= band.max;
                return (
                  <li
                    key={i}
                    className={`flex gap-4 rounded-xl border px-3 py-3 text-[13px] leading-snug ${matched ? "border-primary/25 bg-primary/5" : "text-muted-foreground"}`}
                  >
                    <span className="w-8 shrink-0 font-medium">
                      {band.min === band.max
                        ? band.max
                        : `${band.min}–${band.max}`}
                    </span>
                    <span className="flex-1">{band.descriptor}</span>
                    {matched && <Badge className="self-start">Your band</Badge>}
                  </li>
                );
              })}
            </ul>
            {!row.criteria?.length && (
              <p className="text-muted-foreground text-[13px]">
                No marking criteria supplied.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="h-full md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Your next mark</CardTitle>
            <CardDescription>
              {score === of
                ? "Keep building on these strengths"
                : of - score === 1 && of === 4
                  ? "Fix these and the fourth mark is yours"
                  : "Fix these to earn more marks"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2.5">
              {nextLines.map((line, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
                  <PenCaret className="mt-px size-4 shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <div className="mt-auto px-5 pt-4">
            <Link
              href={rewrite}
              className={cn(
                buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: "w-full",
                }),
              )}
            >
              <PortalIcon name="pen-line" />
              Rewrite with these fixes
            </Link>
          </div>
        </Card>
        <Card className="md:col-span-2 xl:col-span-3">
          <CardHeader className="flex flex-wrap justify-between gap-3">
            <div>
              <CardTitle>Your answer, marked</CardTitle>
              <CardDescription className="mt-1">
                Hover or focus a note to see the words it refers to.
              </CardDescription>
            </div>
            <div className="text-muted-foreground hidden items-center gap-4 text-xs sm:flex">
              <span className="flex items-center gap-1.5">
                <PenTick />
                Mark earned
              </span>
              <span className="flex items-center gap-1.5">
                <PenWave />
                Needs more
              </span>
              <span className="flex items-center gap-1.5">
                <PenCaret />
                Missing
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <MarkedAnswer
              segments={segments}
              notes={comments.map((c) => ({
                n: c.n,
                kind:
                  c.kind === "strength"
                    ? "credit"
                    : c.start === null
                      ? "missing"
                      : "improve",
                title:
                  c.kind === "strength"
                    ? "Mark earned"
                    : c.start === null
                      ? "Add evidence"
                      : "Needs more",
                text: c.body,
              }))}
            />
            <details className="mt-4 text-[13px]">
              <summary className="text-muted-foreground cursor-pointer">
                More
              </summary>
              <div className="space-y-4 pt-3">
                {row.review?.status === "open" && (
                  <p className="text-muted-foreground mt-5 text-[13px]">
                    Your mark is being reviewed.
                  </p>
                )}
                {row.sample_answer && (
                  <details className="mt-5 text-[13px]">
                    <summary className="text-muted-foreground cursor-pointer">
                      Sample answer
                    </summary>
                    <div className="mt-3">
                      <RichText text={row.sample_answer} />
                    </div>
                  </details>
                )}
                {row.explanation && (
                  <details className="mt-5 text-[13px]">
                    <summary className="text-muted-foreground cursor-pointer">
                      Explanation
                    </summary>
                    <div className="mt-3">
                      <RichText text={row.explanation} />
                    </div>
                  </details>
                )}
                {["marked", "reviewed"].includes(markingState(row)) && (
                  <details className="mt-5 text-[13px]">
                    <summary className="text-muted-foreground cursor-pointer">
                      Marking review
                    </summary>
                    <div className="mt-3">
                      <QuestionMark attemptId={row.attempt_id} />
                    </div>
                  </details>
                )}
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
