"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { dateLabel } from "@/lib/practice";
const W = 600,
  H = 180,
  PAD = 8,
  LEFT = 60,
  BOTTOM = H - 28;
export type ScorePoint = {
  id: string;
  day: string;
  at?: string;
  pct: number;
  label: string;
  href: string | null;
};

/** Score history for individual sessions on Progress. */
function ScorePlot({
  points,
  from,
  to,
  title,
  range,
}: {
  points: ScorePoint[];
  from: string;
  to: string;
  title: string;
  range: string;
}) {
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const current = points.find((p) => p.id === selected) ?? points.at(-1);
  const start = Date.parse(points[0]?.at ?? points[0]?.day ?? from);
  const end = Date.parse(points.at(-1)?.at ?? points.at(-1)?.day ?? to);
  const span = Math.max(1, end - start);
  const x = (p: { day: string; at?: string }) =>
    LEFT +
    (start === end ? 0.5 : (Date.parse(p.at ?? p.day) - start) / span) *
      (W - LEFT - PAD);
  const y = (pct: number) => PAD + (1 - pct / 100) * (BOTTOM - PAD);
  const line = (ps: { day: string; at?: string; pct: number }[]) =>
    ps.map((p, i) => `${i ? "L" : "M"}${x(p)},${y(p.pct)}`).join("");
  const dot = (p: ScorePoint) => (
    <>
      <title>{p.label}</title>
      <circle cx={x(p)} cy={y(p.pct)} r={14} fill="transparent" />
      <circle
        cx={x(p)}
        cy={y(p.pct)}
        r={4}
        className="fill-primary group-focus-visible:stroke-ink stroke-card"
        strokeWidth={2}
      />
    </>
  );
  return (
    <div className="space-y-3">
      {current && (
        <div>
          <p className="text-3xl font-semibold tabular-nums">
            {Math.round(current.pct)}%
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {selected ? "Selected session" : "Latest session"}
          </p>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        data-range={range}
      >
        <title id={`${id}-title`}>{title}</title>
        <desc
          id={`${id}-desc`}
        >{`Percentage axis: 0%, 50%, 100%. Date axis: ${from} to ${to}.`}</desc>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <text
              x={LEFT - 8}
              y={y(g)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={20}
              className="fill-muted-foreground"
            >
              {g}%
            </text>
            <line
              x1={LEFT}
              x2={W - PAD}
              y1={y(g)}
              y2={y(g)}
              className="stroke-border"
            />
          </g>
        ))}
        <text
          x={LEFT}
          y={H - 4}
          fontSize={20}
          className="fill-muted-foreground"
        >
          {dateLabel(points[0]?.day ?? from)}
        </text>
        <text
          x={W - PAD}
          y={H - 4}
          textAnchor="end"
          fontSize={20}
          className="fill-muted-foreground"
        >
          {dateLabel(points.at(-1)?.day ?? to)}
        </text>
        <path
          d={line(points)}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
        />
        {points.map((p) =>
          p.href ? (
            <Link
              key={p.id}
              href={p.href}
              aria-label={p.label}
              onMouseEnter={() => setSelected(p.id)}
              onFocus={() => setSelected(p.id)}
              className="group outline-none"
            >
              {dot(p)}
            </Link>
          ) : (
            <g
              key={p.id}
              tabIndex={0}
              aria-label={p.label}
              onMouseEnter={() => setSelected(p.id)}
              onFocus={() => setSelected(p.id)}
              className="group outline-none"
            >
              {dot(p)}
            </g>
          ),
        )}
      </svg>
      {current && (
        <p
          role="tooltip"
          className="bg-muted rounded-lg px-3 py-2 text-xs leading-5"
        >
          {current.label}
        </p>
      )}
    </div>
  );
}

/** Individual finished-session scores; single-answer sessions have no report link. */
export function SessionScoreTrend({
  points,
  from,
  today,
  range,
}: {
  points: ScorePoint[];
  from: string;
  today: string;
  range: string;
}) {
  return (
    <ScorePlot
      points={points}
      from={from}
      to={today}
      title="Score history"
      range={range}
    />
  );
}
