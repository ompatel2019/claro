"use client";

import { useState, useEffect, useRef } from "react";
import { PortalIcon } from "@/components/icons";
import { addDays, type ActivityDay } from "@/lib/activity";
import { type HistoryScore, reportHref, weeklyScores } from "@/lib/progress";
import { dateLabel } from "@/lib/practice";
import Link from "next/link";
import { WeeklyAverageTrend } from "@/components/score-trend";
import { sessionTitle } from "@/lib/session-summary";

export { weeklyScores } from "@/lib/progress";

export function ProgressChart({
  history,
  days,
  volume = false,
  children,
}: {
  history: HistoryScore[];
  days?: ActivityDay[];
  volume?: boolean;
  children?: React.ReactNode;
}) {
  const [table, setTable] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number>();
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setMeasured(Math.max(180, Math.round(entry.contentRect.width))),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const values = volume
    ? (() => {
        const weeks = new Map<string, number>();
        for (const d of days ?? []) {
          const monday = addDays(
            d.day,
            -((new Date(`${d.day}T00:00:00Z`).getUTCDay() + 6) % 7),
          );
          weeks.set(monday, (weeks.get(monday) ?? 0) + d.questions);
        }
        return [...weeks]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, value]) => ({ day, value }));
      })()
    : weeklyScores(history);
  const max = volume
    ? Math.max(
        10,
        Math.ceil(Math.max(0, ...values.map((v) => v.value)) / 50) * 50,
      )
    : 100;
  const width = measured ?? (volume ? 300 : 620),
    height = volume ? 220 : 264;
  const left = 32,
    right = width - 30,
    bottom = height - 26,
    top = 14;
  const points = values.map((v, i) => ({
    x:
      left +
      (right - left) * (values.length === 1 ? 0.5 : i / (values.length - 1)),
    y: bottom - ((bottom - top) * v.value) / max,
  }));
  const last = points.at(-1);
  return (
    <div ref={container}>
      <button
        aria-label={table ? "Show chart" : "Show chart data"}
        onClick={() => setTable(!table)}
        className="text-muted-foreground absolute top-5 right-5 rounded p-1"
      >
        <PortalIcon name="table" size={16} />
      </button>
      {table ? (
        <div className="max-h-[264px] overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left">Week</th>
                <th>{volume ? "Questions" : "Average"}</th>
              </tr>
            </thead>
            <tbody>
              {values.map((v) => (
                <tr key={v.day} className="border-t">
                  <td className="py-2">{dateLabel(v.day, true)}</td>
                  <td className="text-right">
                    {Math.round(v.value)}
                    {!volume && "%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {children}
          {!volume && (
            <ul>
              {history
                .filter((s) => s.finished_at && reportHref(s))
                .map((s) => (
                  <li key={s.id}>
                    <Link className="text-xs underline" href={reportHref(s)!}>
                      {sessionTitle({ ...s, config: { mode: s.config.mode } })}{" "}
                      · {dateLabel(s.finished_at, true)} ·{" "}
                      {Math.round(s.pct ?? 0)}%
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : !volume && values.length ? (
        <WeeklyAverageTrend
          points={values.map((v) => ({ day: v.day, pct: v.value }))}
          height={264}
        />
      ) : (
        <svg
          role="img"
          aria-label={
            volume ? "Questions answered per week" : "Weekly practice average"
          }
          viewBox={`0 0 ${width} ${height}`}
          className={volume ? "h-[220px] w-full" : "h-[264px] w-full"}
          preserveAspectRatio="none"
        >
          {[0, 0.25, 0.5, 0.75, 1]
            .filter((n) => !volume || n === 0 || n === 0.5 || n === 1)
            .map((n) => (
              <g key={n}>
                <line
                  x1={left}
                  x2={right}
                  y1={bottom - (bottom - top) * n}
                  y2={bottom - (bottom - top) * n}
                  stroke="var(--border)"
                  strokeOpacity=".6"
                />
                <text
                  x={left - 10}
                  y={bottom - (bottom - top) * n + 4}
                  textAnchor="end"
                  fill="var(--muted-foreground)"
                  fontSize="10"
                >
                  {Math.round(max * n)}
                  {!volume && "%"}
                </text>
              </g>
            ))}
          {volume &&
            points.map((p, i) => (
              <rect
                key={values[i].day}
                x={p.x - 6}
                y={p.y}
                width={12}
                height={bottom - p.y}
                rx="3"
                fill={
                  i === points.length - 1 ? "var(--chart-2)" : "var(--chart-3)"
                }
              />
            ))}
          {last && (
            <text
              x={volume ? last.x : last.x + 10}
              y={last.y - 8}
              textAnchor={volume ? "middle" : "start"}
              fontSize="10"
              fontWeight="600"
              fill="var(--foreground)"
            >
              {Math.round(values.at(-1)!.value)}
              {!volume && "%"}
            </text>
          )}
          {values
            .filter(
              (_, i) =>
                i === 0 ||
                i === values.length - 1 ||
                (values.length > 5 &&
                  i % Math.ceil(values.length / (width < 400 ? 3 : 5)) === 0),
            )
            .map((v) => (
              <text
                key={v.day}
                x={points[values.indexOf(v)].x}
                y={height - 6}
                textAnchor="middle"
                fontSize="10"
                fill="var(--muted-foreground)"
              >
                {v === values.at(-1)
                  ? "Now"
                  : dateLabel(v.day, true).replace(/^\w+ /, "")}
              </text>
            ))}
          {!values.length && (
            <text
              x={width / 2}
              y={height / 2}
              textAnchor="middle"
              fontSize="12"
              fill="var(--muted-foreground)"
            >
              No activity in this range
            </text>
          )}
        </svg>
      )}
    </div>
  );
}
