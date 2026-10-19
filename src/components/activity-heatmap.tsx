"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  addDays,
  dayLabel,
  heatmapWeeks,
  monthLabels,
  shade,
  SHADE_LABELS,
  type ActivityDay,
} from "@/lib/activity";
import { Flame, PortalIcon } from "@/components/icons";
import { plural } from "@/lib/practice";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

const CELL = 14; // 11 px cell + 3 px gap
const HEAT = Array.from({ length: 5 }, (_, level) => `var(--heat-${level})`);

/** §2.3 K11: a GitHub-style year of active Sydney days, with streaks above. */
export function ActivityHeatmap({
  days,
  today,
  current,
  longest,
  link = "/student/activity?date=",
  error,
  errorContent,
  home,
}: {
  days: ActivityDay[];
  today: string;
  current: number;
  longest: number;
  /** Prefix for a day's link; the ISO date is appended. */
  link?: string;
  error?: boolean;
  errorContent?: React.ReactNode;
  /** Home's "Your study days" card: big streak numbers, today marker and a call to action. */
  home?: { action: React.ReactNode; template?: boolean };
}) {
  const cell = home?.template ? 18 : CELL;
  const allWeeks = heatmapWeeks(today);
  const [weekCount, setWeekCount] = useState(53);
  const [offset, setOffset] = useState(0);
  const end = Math.max(weekCount, allWeeks.length - offset);
  const weeks = allWeeks.slice(Math.max(0, end - weekCount), end);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const [focus, setFocus] = useState(today);
  const lastDay = weeks.flat().findLast((day) => day !== null)!;
  const focusDay = weeks.some((week) => week.includes(focus)) ? focus : lastDay;
  const [tip, setTip] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const from = allWeeks[0][0]!;
  const active = days.filter(
    (d) => d.day >= from && d.questions + d.cards > 0,
  ).length;

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      // Keep whole weeks visible, leaving room for weekday labels.
      const count = Math.max(
        1,
        Math.min(53, Math.floor((entry.contentRect.width - 32) / cell)),
      );
      const resizedWeeks = heatmapWeeks(today);
      const nextEnd = Math.max(count, resizedWeeks.length - offset);
      const nextWeeks = resizedWeeks.slice(
        Math.max(0, nextEnd - count),
        nextEnd,
      );
      const focused = document.activeElement as HTMLElement | null;
      if (
        grid.current?.contains(focused) &&
        !nextWeeks.flat().includes(focused?.dataset.day ?? "")
      ) {
        const day = nextWeeks.flat().findLast((day) => day !== null)!;
        grid.current.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus();
      }
      setWeekCount(count);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, today, offset, cell]);

  function move(e: React.KeyboardEvent, day: string) {
    const step = {
      ArrowUp: -1,
      ArrowDown: 1,
      ArrowLeft: -7,
      ArrowRight: 7,
    }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = weeks.flat().includes(addDays(day, step))
      ? addDays(day, step)
      : day;
    setFocus(next);
    grid.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus();
  }

  const labels = monthLabels(weeks).filter((m, i, labels) => {
    const end = labels[i + 1]?.col ?? weeks.length;
    return (end - m.col) * cell >= 28;
  });
  const tipDay = tip ? byDay.get(tip) : undefined;
  const [col, row] = tip
    ? [
        weeks.findIndex((w) => w.includes(tip)),
        (new Date(`${tip}T00:00:00Z`).getUTCDay() + 6) % 7,
      ]
    : [0, 0];

  const caption =
    active === 0 && !error
      ? "Answer a question or review a flashcard to start your streak."
      : null;
  return (
    <Card data-component="StudyDays" className={cn(home && "h-full")}>
      {!home && (
        <CardHeader>
          <CardTitle>Study days</CardTitle>
          <CardDescription>
            Daily questions and flashcards over the last year
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className={cn("space-y-3", home && "flex h-full flex-col")}>
        {home ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold">
                  {home.template ? "Study days" : "Your study days"}
                </h2>
                <p className="text-muted-foreground mt-1 text-[13px]">
                  {home.template
                    ? "Consistency is the cheat code."
                    : "Every day you study lights up a square."}
                </p>
              </div>
              {home.template && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Earlier weeks"
                    disabled={end === weekCount}
                    onClick={() =>
                      setOffset(Math.min(53 - weekCount, offset + weekCount))
                    }
                    className="hover:bg-accent grid size-7 place-items-center rounded-full disabled:opacity-30"
                  >
                    <PortalIcon name="chevron-left" className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Later weeks"
                    disabled={end === allWeeks.length}
                    onClick={() => setOffset(Math.max(0, offset - weekCount))}
                    className="hover:bg-accent grid size-7 place-items-center rounded-full disabled:opacity-30"
                  >
                    <PortalIcon name="chevron-right" className="size-4" />
                  </button>
                </div>
              )}
            </div>
            {!error && (
              <dl
                className={
                  home.template
                    ? "grid grid-cols-3 gap-3 pt-1 pb-2"
                    : "flex gap-6"
                }
              >
                {(
                  [
                    [current, "Day streak"],
                    [longest, "Longest streak"],
                    [active, "Days studied"],
                  ] as const
                ).map(([value, label]) => (
                  <div key={label} className="flex flex-col-reverse">
                    <dt className="text-muted-foreground mt-1.5 text-xs">
                      {label}
                    </dt>
                    <dd
                      className={cn(
                        "text-2xl leading-tight font-bold",
                        home.template && "flex items-center gap-1 text-[22px]",
                      )}
                    >
                      {value}
                      {home.template && label === "Day streak" && (
                        <Flame aria-hidden className="text-brand size-4" />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {caption && (
              <p className="text-muted-foreground text-xs">{caption}</p>
            )}
          </div>
        ) : (
          <h2 className="sr-only">Activity</h2>
        )}
        {!error && !home && (
          <p className="text-sm">
            Current streak <strong>{plural(current, "day")}</strong> · Longest{" "}
            <strong>{plural(longest, "day")}</strong> ·{" "}
            {plural(active, "active day")} in the last year
          </p>
        )}
        {error ? (
          (errorContent ?? (
            <p
              role="alert"
              className="bg-destructive-soft text-destructive rounded-xl p-3 text-sm"
            >
              We couldn’t load your activity. Refresh to try again.
            </p>
          ))
        ) : (
          <div
            ref={container}
            data-testid="activity-heatmap"
            className="min-w-0 pb-1"
          >
            <div
              data-component="StudyHeatmap"
              className="relative w-max pt-5 pl-8 text-[11px]"
            >
              {labels.map((m) => (
                <span
                  key={m.col}
                  data-month-label
                  aria-hidden
                  className="text-muted-foreground absolute top-0"
                  style={{ left: 32 + m.col * cell }}
                >
                  {m.label}
                </span>
              ))}
              {[
                ["Mon", 0],
                ["Wed", 2],
                ["Fri", 4],
                ["Sun", 6],
              ].map(([day, row]) => (
                <span
                  key={day}
                  aria-hidden
                  className="text-muted-foreground absolute left-0 leading-[11px]"
                  style={{ top: 20 + Number(row) * cell }}
                >
                  {day}
                </span>
              ))}
              <div
                ref={grid}
                role="group"
                aria-label={`Activity from ${weeks[0][0]} to ${lastDay}`}
                className="grid grid-flow-col gap-[3px]"
                style={{
                  gridAutoColumns: cell - 3,
                  gridTemplateRows: `repeat(7,${cell - 3}px)`,
                }}
                onMouseLeave={() => setTip(null)}
              >
                {weeks.flat().map((day, i) => {
                  if (!day) return <span key={i} aria-hidden />;
                  const d = byDay.get(day);
                  const count = (d?.questions ?? 0) + (d?.cards ?? 0);
                  const label = dayLabel(day, d?.questions, d?.cards);
                  return (
                    <Link
                      key={day}
                      href={`${link}${day}`}
                      prefetch={false}
                      data-day={day}
                      aria-label={`${label} (${SHADE_LABELS[shade(count)]})`}
                      tabIndex={day === focusDay ? 0 : -1}
                      onKeyDown={(e) => move(e, day)}
                      onFocus={() => {
                        setFocus(day);
                        setTip(day);
                      }}
                      onBlur={() => setTip(null)}
                      onMouseEnter={() => setTip(day)}
                      aria-current={home && day === today ? "date" : undefined}
                      className="focus-visible:outline-primary aria-[current=date]:ring-foreground aria-[current=date]:ring-offset-card rounded-[3px] focus-visible:outline-2 aria-[current=date]:ring-1 aria-[current=date]:ring-offset-1"
                      style={{
                        width: cell - 3,
                        height: cell - 3,
                        background: HEAT[shade(count)],
                      }}
                    />
                  );
                })}
              </div>
              {tip && col >= 0 && (
                <div
                  role="tooltip"
                  className="bg-primary text-primary-foreground pointer-events-none absolute left-0 z-10 w-max max-w-full -translate-y-full rounded-md px-2 py-1 text-xs whitespace-normal"
                  style={{
                    top: 20 + row * cell - 4,
                  }}
                >
                  {dayLabel(tip, tipDay?.questions, tipDay?.cards)}
                </div>
              )}
            </div>
          </div>
        )}
        {!error && !home?.template && weekCount < allWeeks.length && (
          <div className="flex justify-between gap-2 text-xs">
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={end === weekCount}
              onClick={() =>
                setOffset(Math.min(53 - weekCount, offset + weekCount))
              }
            >
              Earlier weeks
            </button>
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={end === allWeeks.length}
              onClick={() => setOffset(Math.max(0, offset - weekCount))}
            >
              Later weeks
            </button>
          </div>
        )}
        <div
          className={cn(
            "text-muted-foreground flex flex-col-reverse items-start gap-2 text-xs sm:flex-row sm:items-center sm:justify-between",
            home && "flex-row flex-wrap items-center justify-between",
            home && !home.template && "mt-auto",
          )}
        >
          {!home && <span>{caption}</span>}
          <span className="flex items-center gap-1" aria-hidden>
            Less
            {HEAT.map((color) => (
              <span
                key={color}
                className="size-2.5 rounded-[2px]"
                style={{ background: color }}
              />
            ))}
            More
            {home && !home.template && (
              <span className="ml-3 flex items-center gap-1">
                <span className="ring-foreground ring-offset-card size-2.5 rounded-[2px] ring-1 ring-offset-1" />
                Today
              </span>
            )}
          </span>
          {home?.template &&
          (byDay.get(today)?.questions ?? 0) + (byDay.get(today)?.cards ?? 0) >
            0 ? (
            <span className="flex items-center gap-1.5 text-xs">
              <PortalIcon
                name="circle-check"
                className="text-success size-3.5"
              />
              Today is lit
            </span>
          ) : (
            home?.action
          )}
        </div>
      </CardContent>
    </Card>
  );
}
