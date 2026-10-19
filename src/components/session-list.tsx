import {
  sessionTitle,
  sessionStatus,
  sessionScore,
  sessionHref,
  isStudentSession,
} from "@/lib/session-summary";
import Link from "next/link";
import { History } from "@/components/icons";
import {
  dateLabel,
  topicNames,
  type Session,
  type Topic,
} from "@/lib/practice";
import { StatusPill } from "./status-pill";
import { EmptyState } from "./empty-state";
import { Card } from "./ui/card";
import { SessionIcon } from "./student/activity/session-icon";
export function SessionList({
  sessions: suppliedSessions,
  topics,
  home = false,
  empty = "No sessions yet. Start a sprint to make your first next step.",
}: {
  sessions: (Session & {
    attempts?: { status: string; check_status?: string }[];
    recall?: { knew: number; total: number };
  })[];
  topics: Topic[];
  home?: boolean;
  empty?: string;
}) {
  const sessions = suppliedSessions.filter(isStudentSession);
  if (!sessions.length)
    return (
      <EmptyState icon={History} title="No sessions" description={empty} />
    );
  return (
    <Card
      className={
        home
          ? "-mx-2 gap-0 rounded-none border-0 bg-transparent py-0 shadow-none"
          : "gap-0 py-0"
      }
    >
      <ul className={home ? "" : "divide-border/70 divide-y"}>
        {sessions.map((s) => {
          const href = sessionHref(s);
          const content = (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <SessionIcon kind={s.kind ?? "sprint"} />
                <div className="min-w-0">
                  <p
                    className={
                      home
                        ? "truncate text-sm font-medium"
                        : "truncate text-[13px] font-medium"
                    }
                  >
                    {sessionTitle(
                      home
                        ? {
                            ...s,
                            config: { ...s.config, topics: [], subtopics: [] },
                          }
                        : s,
                      topics,
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {home
                      ? `${new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }).format(new Date(s.started_at)).replace(/\s/g, "")} · ${!s.finished_at && s.kind === "flashcards" ? "Due for review" : topicNames(s.config.subtopics?.length ? s.config.subtopics : s.config.topics, topics)}`
                      : dateLabel(s.started_at)}
                  </p>
                </div>
              </div>
              {s.finished_at ? (
                <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                  {home && s.kind === "flashcards" && s.recall ? (
                    <>
                      {s.recall.knew}/{s.recall.total}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        knew
                      </span>
                    </>
                  ) : (
                    sessionScore(
                      s.score != null && s.max_score
                        ? (100 * s.score) / s.max_score
                        : null,
                      sessionStatus(s, s.attempts),
                      s.kind === "flashcards" &&
                        String(s.config.mode) === "study",
                    )
                  )}
                  {home &&
                    s.kind !== "flashcards" &&
                    s.score != null &&
                    !!s.max_score &&
                    sessionStatus(s, s.attempts) === "Finished" && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        {s.score}/{s.max_score}
                      </span>
                    )}
                </span>
              ) : (
                <StatusPill pill="In progress" />
              )}
            </>
          );
          const className = home
            ? "hover:bg-accent flex min-h-14 items-center justify-between gap-3 rounded-lg px-2 py-2.5"
            : "hover:bg-surface flex min-h-14 items-center justify-between gap-3 px-5 py-3";
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
