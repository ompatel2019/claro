import Link from "next/link";
import type { ReviewRow } from "@/lib/feedback";
import type { SprintConfig, Topic } from "@/lib/practice";
import { below, scored, sprintHref } from "@/lib/results";
import { PortalIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { Meter } from "@/components/claro/data-display";

export function ResultsNextStep({
  rows,
  topics,
  config,
  cards,
}: {
  rows: ReviewRow[];
  topics: Topic[];
  config: SprintConfig;
  cards: Record<string, number>;
}) {
  const missed = rows.filter((r) => r.type === "mcq" && below(r));
  const grouped = [...new Set(rows.flatMap((r) => r.topic_id ?? []))]
    .map((id) => {
      const rs = rows.filter((r) => r.topic_id === id && scored(r));
      const possible = rs.reduce(
        (n, r) => n + Number(r.max_marks ?? r.marks),
        0,
      );
      const earned = rs.reduce((n, r) => n + Number(r.mark), 0);
      return {
        id,
        rs,
        possible,
        earned,
        percentage: possible ? Math.round((earned / possible) * 100) : 0,
      };
    })
    .filter((t) => t.possible > t.earned)
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 2);
  return (
    <div className="grid gap-3">
      {!!missed.length && (
        <div className="bg-brand-soft/60 border-brand/30 flex items-center gap-4 rounded-xl border p-4">
          <span className="text-brand bg-card grid size-10 shrink-0 place-items-center rounded-full">
            <PortalIcon name="rotate-ccw" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Retry the {missed.length} multiple choice questions you missed
            </p>
            <p className="text-muted-foreground text-[13px]">
              About {Math.ceil(missed.length * 1.25)} minutes · explanations
              shown after each one
            </p>
          </div>
          <Link
            href={sprintHref(
              { ...config, mode: "mcq", feedback: "each" },
              { history: "mistakes" },
            )}
            className={buttonVariants({ size: "sm" })}
          >
            Retry mistakes
          </Link>
        </div>
      )}
      {!!grouped.length && (
        <div className="grid gap-3 sm:grid-cols-2">
          {grouped.map((t) => (
            <div key={t.id} className="grid gap-3 rounded-xl border p-4">
              <div>
                <div className="flex justify-between gap-3 text-sm font-semibold">
                  <p>{topics.find((topic) => topic.id === t.id)?.name}</p>
                  <span>{t.percentage}%</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t.possible - t.earned} of {t.possible} marks dropped ·{" "}
                  {t.rs
                    .filter(below)
                    .map((r) => `Q${r.position}`)
                    .join(", ")}
                </p>
              </div>
              <Meter
                value={t.percentage}
                label="Topic score"
                className="h-1.5"
              />
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/student/sprint?type=${config.mode}&sub=${t.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Practise
                </Link>
                {!!cards[t.id] && (
                  <Link
                    href={`/student/flashcards?topic=${t.id}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Review cards
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!missed.length && !grouped.length && (
        <p className="text-muted-foreground text-[13px]">
          {rows.some(scored)
            ? "You earned every available mark. Try another sprint to keep practising."
            : "Your next steps will appear once marking finishes."}
        </p>
      )}
    </div>
  );
}
