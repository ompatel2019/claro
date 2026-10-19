import {
  sessionTitle,
  sessionStatus,
  sessionScore,
  sessionHref,
  isStudentSession,
} from "@/lib/session-summary";
import Link from "next/link";
import { History } from "@/components/icons";
import { dateLabel, type Session, type Topic } from "@/lib/practice";
import { StatusPill } from "./status-pill";
import { EmptyState } from "./empty-state";
import { Card } from "./ui/card";
import { SessionIcon } from "./student/activity/session-icon";
export function SessionList({
  sessions: suppliedSessions,
  topics,
  empty = "No sessions yet. Start a sprint to make your first next step.",
}: {
  sessions: (Session & {
    attempts?: { status: string; check_status?: string }[];
  })[];
  topics: Topic[];
  empty?: string;
}) {
  const sessions = suppliedSessions.filter(isStudentSession);
  if (!sessions.length)
    return (
      <EmptyState icon={History} title="No sessions" description={empty} />
    );
  return (
    <Card className="gap-0 py-0">
      <ul className="divide-border/70 divide-y">
        {sessions.map((s) => {
          const href = sessionHref(s);
          const content = (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <SessionIcon kind={s.kind ?? "sprint"} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {sessionTitle(s, topics)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {dateLabel(s.started_at)}
                  </p>
                </div>
              </div>
              {s.finished_at ? (
                <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                  {sessionScore(
                    s.score != null && s.max_score
                      ? (100 * s.score) / s.max_score
                      : null,
                    sessionStatus(s, s.attempts),
                    s.kind === "flashcards" &&
                      String(s.config.mode) === "study",
                  )}
                </span>
              ) : (
                <StatusPill pill="In progress" />
              )}
            </>
          );
          const className =
            "hover:bg-surface flex min-h-14 items-center justify-between gap-3 px-5 py-3";
          return (
            <li key={s.id}>
              {href ? (
                <Link href={href} prefetch={false} className={className}>
                  {content}
                </Link>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
