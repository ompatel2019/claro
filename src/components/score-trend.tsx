"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { dateLabel } from "@/lib/practice";
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
  points: suppliedPoints,
  from,
  to,
  title,
  range,
  compact = false,
}: {
  points: ScorePoint[];
  from: string;
  to: string;
  title: string;
  range: string;
  compact?: boolean;
}) {
  const id = useId();
  const plot = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!plot.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  // Match SVG coordinates to CSS pixels, so mobile labels keep their readable size.
  const W = width,
    H = width < 400 ? 180 : 230,
    PAD = 8,
    LEFT = 38,
    BOTTOM = H - 28;
  // RPC rows need not be chronological. Missing timestamps must never become epoch dates.
  const timestamp = (p: ScorePoint) => Date.parse(p.at || p.day);
  const points = suppliedPoints
    .filter(
      (p) =>
        typeof p.day === "string" &&
        Number.isFinite(timestamp(p)) &&
        Number.isFinite(p.pct) &&
        p.day >= from &&
        p.day <= to,
    )
    .slice()
    .sort((a, b) => timestamp(a) - timestamp(b));
  const [selected, setSelected] = useState<string | null>(null);
  const current = points.find((p) => p.id === selected) ?? points.at(-1);
  const start = Date.parse(points[0]?.at || points[0]?.day || from);
  const end = Date.parse(points.at(-1)?.at || points.at(-1)?.day || to);
  const span = Math.max(1, end - start);
  const x = (p: { day: string; at?: string }) =>
    LEFT +
    (start === end ? 0.5 : (Date.parse(p.at || p.day) - start) / span) *
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
        className={`${p.id === current?.id ? "fill-chart-2" : "fill-chart-1"} group-focus-visible:stroke-ink stroke-card`}
        strokeWidth={2}
      />
    </>
  );
  return (
    <div className="space-y-3">
      {!compact && current && (
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
        ref={plot}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full min-w-0"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        data-range={range}
      >
        <title id={`${id}-title`}>{title}</title>
        <desc
          id={`${id}-desc`}
        >{`Percentage axis: 0%, 25%, 50%, 75%, 100%. Date axis: ${from} to ${to}.`}</desc>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <text
              x={LEFT - 8}
              y={y(g)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              className="fill-chart-axis"
            >
              {g}%
            </text>
            <line
              x1={LEFT}
              x2={W - PAD}
              y1={y(g)}
              y2={y(g)}
              className="stroke-chart-grid"
            />
          </g>
        ))}
        <text x={LEFT} y={H - 4} fontSize={10} className="fill-chart-axis">
          {dateLabel(points[0]?.day ?? from)}
        </text>
        <text
          x={W - PAD}
          y={H - 4}
          textAnchor="end"
          fontSize={10}
          className="fill-chart-axis"
        >
          {dateLabel(points.at(-1)?.day ?? to)}
        </text>
        <defs>
          <linearGradient id={`${id}-wash`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity=".12" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length > 1 && (
          <path
            d={`${line(points)}L${x(points.at(-1)!)},${BOTTOM}L${x(points[0])},${BOTTOM}Z`}
            fill={`url(#${id}-wash)`}
          />
        )}
        <path
          d={line(points)}
          fill="none"
          className="stroke-chart-1"
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
      {!compact && current && (
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
  compact,
}: {
  points: ScorePoint[];
  from: string;
  today: string;
  range: string;
  compact?: boolean;
}) {
  return (
    <ScorePlot
      compact={compact}
      points={points}
      from={from}
      to={today}
      title="Score history"
      range={range}
    />
  );
}

/** Home/Progress weekly marked-session means, with a fixed 80% target. */
export function WeeklyAverageTrend({
  points,
}: {
  points: { day: string; pct: number }[];
}) {
  const id = useId();
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(680);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width) setWidth(entry.contentRect.width);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const h = 196,
    left = 34,
    right = width - 40,
    top = 9,
    bottom = 169;
  const x = (i: number) =>
    left + (i / Math.max(1, points.length - 1)) * (right - left);
  const y = (pct: number) => bottom - (pct / 100) * (bottom - top);
  const coords = points.map((p, i) => [x(i), y(p.pct)]);
  const path = coords
    .map(([px, py], i) => {
      if (!i) return `M${px},${py}`;
      const prev = coords[i - 1];
      const mid = (prev[0] + px) / 2;
      return `C${mid},${prev[1]} ${mid},${py} ${px},${py}`;
    })
    .join(" ");
  const last = points.at(-1);
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${h}`}
      className="block h-[196px] w-full overflow-visible"
      role="img"
      aria-label="Weekly practice average with 80% target"
    >
      <defs>
        <linearGradient id={`${id}-weekly`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity=".12" />
          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <text
            x={left - 10}
            y={y(v) + 4}
            textAnchor="end"
            fontSize={10}
            fill="var(--muted-foreground)"
          >
            {v}%
          </text>
          <line
            x1={left}
            x2={right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--chart-grid)"
          />
        </g>
      ))}
      <line
        x1={left}
        x2={right}
        y1={y(80)}
        y2={y(80)}
        stroke="var(--muted-foreground)"
        strokeDasharray="4 4"
      />
      <text
        x={right + 8}
        y={y(80) + 4}
        fontSize={10}
        fill="var(--muted-foreground)"
      >
        80%
      </text>
      {last && (
        <>
          <path
            d={`${path} L${x(points.length - 1)},${bottom} L${left},${bottom} Z`}
            fill={`url(#${id}-weekly)`}
          />
          <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth={2} />
          <circle
            cx={x(points.length - 1)}
            cy={y(last.pct)}
            r={4.5}
            fill="var(--brand)"
            stroke="var(--card)"
            strokeWidth={2}
          />
          <text
            x={right + 10}
            y={y(last.pct) + 4}
            fontSize={11}
            fontWeight={600}
            fill="var(--foreground)"
          >
            {Math.round(last.pct)}%
          </text>
        </>
      )}
      {points
        .filter(
          (_, i) =>
            i === 0 ||
            i === points.length - 1 ||
            (width > 450 &&
              i % Math.max(1, Math.ceil(points.length / 6)) === 0),
        )
        .map((p) => (
          <text
            key={p.day}
            x={x(points.indexOf(p))}
            y={190}
            textAnchor="middle"
            fontSize={10}
            fill="var(--muted-foreground)"
          >
            {p === last
              ? "Now"
              : new Intl.DateTimeFormat("en-AU", {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(p.day))}
          </text>
        ))}
    </svg>
  );
}
