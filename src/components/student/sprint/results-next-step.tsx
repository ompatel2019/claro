import Link from "next/link";
import { markingState, type ReviewRow } from "@/lib/feedback";
import type { SprintConfig, Topic } from "@/lib/practice";
import { below, scored, sprintHref } from "@/lib/results";
import { PortalIcon } from "@/components/icons";
import { PenCaret } from "@/components/claro/markup-answer";
import { buttonVariants } from "@/components/ui/button";
import { Meter } from "@/components/claro/data-display";

export function ResultsNextStep({
  rows,
  topics,
  config,
  cards,
  note,
}: {
  rows: ReviewRow[];
  topics: Topic[];
  config: SprintConfig;
  cards: Record<string, number>;
  note?: { text: string; question: number | null } | null;
}) {
  const grouped = [...new Set(rows.flatMap((r) => r.topic_id ?? []))]
    .map((id) => {
      const rs = rows.filter((r) => r.topic_id === id && scored(r));
      const possible = rs.reduce(
        (n, r) => n + Number(r.max_marks ?? r.marks),
        0,
      );
      const earned = rs.reduce((n, r) => n + Number(r.mark), 0);
      const complete = rows.every((r) => r.topic_id !== id || scored(r));
      return { id, rs, possible, earned, complete, dropped: possible - earned };
    })
    .filter((t) => t.possible > 0)
    .sort((a, b) => b.dropped - a.dropped);
  const needsWork = grouped.filter((t) => t.dropped > 0);
  const fullMarks = grouped.filter((t) => t.dropped === 0 && t.complete);
  const missed = rows.filter((r) => r.type === "mcq" && below(r));
  const allFullMarks =
    rows.length > 0 &&
    rows.every(
      (r) => scored(r) && Number(r.mark) === Number(r.max_marks ?? r.marks),
    );
  const needsAttention = rows.some(
    (r) => !scored(r) && markingState(r) !== "marking",
  );
  const name = (id: string) => topics.find((t) => t.id === id)?.name ?? "Topic";
  return (
    <section className="space-y-5" aria-label="Your next step">
      <div className="bg-muted flex items-start gap-3 rounded-2xl px-5 py-5 sm:px-6">
        <PenCaret className="mt-1 size-5 shrink-0" />
        <div>
          <h2 className="text-base font-semibold">Your next step</h2>
          <p className="text-ink-2 mt-1 text-sm">
            {note?.text ??
              (needsWork.length
                ? `Focus on ${name(needsWork[0].id)} — ${needsWork[0].dropped} marks dropped here.`
                : allFullMarks
                  ? "You earned every available mark. Try another sprint to keep practising."
                  : needsAttention
                    ? "Review the answers that couldn’t be marked and try again."
                    : rows.some((r) => scored(r) && below(r))
                      ? "Review the marks you dropped while they’re fresh."
                      : "Your next steps will appear once marking finishes.")}
          </p>
          {note?.question != null &&
            rows.some((r) => r.position === note.question) && (
              <a
                href={`#q-${note.question}`}
                className="text-ink-2 mt-2 mr-4 inline-flex items-center gap-2 text-[13px] underline underline-offset-4"
              >
                Go to Q{note.question}
                <PortalIcon name="arrow-right" className="size-4" />
              </a>
            )}
          {!!missed.length && (
            <Link
              className="text-ink-2 mt-2 inline-flex items-center gap-2 text-[13px] underline underline-offset-4"
              href={sprintHref(
                { ...config, mode: "mcq", feedback: "each" },
                { history: "mistakes" },
              )}
            >
              Retry the {missed.length} multiple choice question
              {missed.length === 1 ? "" : "s"} you missed{" "}
              <PortalIcon name="arrow-right" className="size-4" />
            </Link>
          )}
        </div>
      </div>
      {!!grouped.length && (
        <div className="space-y-3">
          <h2 className="text-xl font-[650] tracking-tight">
            Where marks dropped
          </h2>
          <div className="grid items-stretch gap-4 sm:grid-cols-2">
            {needsWork.map((t) => (
              <div
                key={t.id}
                className="bg-card grid h-full content-start gap-3 rounded-2xl border p-5"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                  <h3>{name(t.id)}</h3>
                  <span className="shrink-0 tabular-nums">
                    {t.earned}/{t.possible}
                  </span>
                </div>
                <p className="text-muted-foreground text-[13px]">
                  {t.dropped} marks dropped ·{" "}
                  {t.rs
                    .filter(below)
                    .map((r) => `Q${r.position}`)
                    .join(", ")}
                </p>
                <Meter
                  value={(t.earned / t.possible) * 100}
                  label="Topic score"
                  className="h-1.5"
                />
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/student/sprint?type=${config.mode}&${topics.find((topic) => topic.id === t.id)?.parent_id ? "sub" : "topics"}=${t.id}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Practise
                  </Link>
                  {!!cards[t.id] && (
                    <Link
                      href={`/student/flashcards?topic=${t.id}`}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                    >
                      Review cards
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!!fullMarks.length && (
            <ul aria-label="Full marks" className="divide-y">
              {fullMarks.map((t) => (
                <li
                  key={t.id}
                  className="text-success-text flex flex-wrap items-center gap-2 py-2.5 text-[13px]"
                >
                  <PortalIcon name="check" className="size-4" />
                  <span className="font-medium">{name(t.id)}</span>
                  <span className="ml-auto tabular-nums">
                    {t.earned}/{t.possible} · Full marks
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
