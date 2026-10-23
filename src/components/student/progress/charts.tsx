"use client";

import { useState, useEffect, useRef } from "react";
import { PortalIcon } from "@/components/icons";
import { addDays, type ActivityDay } from "@/lib/activity";
import {
  type HistoryScore,
  PRACTICE_TARGET,
  reportHref,
  weeklyScores,
} from "@/lib/progress";
import { dateLabel } from "@/lib/practice";
import Link from "next/link";
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
  const left = 36,
    right = width - 44,
    bottom = height - 26,
    top = 28;
  const points = values.map((v, i) => ({
    x:
      left +
      (right - left) * (values.length === 1 ? 0.5 : i / (values.length - 1)),
    y: bottom - ((bottom - top) * v.value) / max,
  }));
  const last = points.at(-1);
  return (
    <div ref={container}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        {!volume && values.length > 0 ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="num-display relative inline-block px-3 py-1 text-3xl font-bold">
              {Math.round(values.at(-1)!.value)}%
              <svg
                className="pen pen-draw absolute -inset-x-1 -inset-y-2 h-[calc(100%+16px)] w-[calc(100%+8px)]"
                viewBox="0 0 160 112"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M135.7 20.4C108.1 3.8 67.2 5.7 35.1 19.2C8.9 30.5 1.7 62.4 21.4 85.1C43.1 111.6 92.7 108.4 124.3 94.2C153.1 81.1 158.6 53.6 147.1 30.2C139.7 16.5 127.6 11.1 114.2 10.3"
                  pathLength="1"
                  fill="none"
                  strokeWidth="2.6"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </span>
            <span className="text-muted-foreground text-xs">
              Latest weekly average
              <br />
              Week of {dateLabel(values.at(-1)!.day, true)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">
            {volume ? "Weekly questions" : "Your weekly marked sessions"}
          </span>
        )}
        <button
          aria-label={table ? "Show chart" : "Show chart data"}
          aria-pressed={table}
          onClick={() => setTable(!table)}
          className="text-ink-2 flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold"
        >
          <PortalIcon
            name={table ? "chart-line" : "table"}
            size={20}
            strokeWidth={1.5}
          />
          {table ? "Chart" : "Table"}
        </button>
      </div>
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
                  stroke="var(--chart-grid)"
                  strokeWidth="1"
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
          {!volume && (
            <>
              <line
                x1={left}
                x2={right}
                y1={bottom - ((bottom - top) * PRACTICE_TARGET) / 100}
                y2={bottom - ((bottom - top) * PRACTICE_TARGET) / 100}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
              />
              <text
                x={right}
                y={bottom - ((bottom - top) * PRACTICE_TARGET) / 100 - 8}
                textAnchor="end"
                fontSize="11"
                fill="var(--muted-foreground)"
              >
                Target {PRACTICE_TARGET}%
              </text>
              {points.length > 0 && (
                <>
                  <path
                    d={points
                      .map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`)
                      .join(" ")}
                    fill="none"
                    stroke="var(--chart-1)"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {points.map((p, i) => (
                    <circle
                      key={values[i].day}
                      cx={p.x}
                      cy={p.y}
                      r={i === points.length - 1 ? 5 : 3}
                      fill={
                        i === points.length - 1
                          ? "var(--brand)"
                          : "var(--chart-1)"
                      }
                      stroke="var(--card)"
                      strokeWidth="2"
                    />
                  ))}
                </>
              )}
            </>
          )}
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
              x={last.x}
              y={last.y + (last.y < top + 20 ? 22 : -12)}
              textAnchor="middle"
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
                {dateLabel(v.day, true).replace(/^\w+ /, "")}
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
