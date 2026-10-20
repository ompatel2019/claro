"use client";
import { useEffect, useId, useRef, useState } from "react";
import { PRACTICE_TARGET } from "@/lib/progress";
/** Home/Progress weekly marked-session means, with a fixed 80% target. */
export function WeeklyAverageTrend({
  points,
  height = 196,
}: {
  points: { day: string; pct: number }[];
  height?: number;
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
  const h = height,
    left = 34,
    right = width - 40,
    top = 9,
    bottom = h - 27;
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
      className="block w-full overflow-visible"
      style={{ height }}
      role="img"
      aria-label={`Weekly practice average with ${PRACTICE_TARGET}% target`}
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
        y1={y(PRACTICE_TARGET)}
        y2={y(PRACTICE_TARGET)}
        stroke="var(--muted-foreground)"
        strokeDasharray="4 4"
      />
      <text
        x={right + 8}
        y={y(PRACTICE_TARGET) + 4}
        fontSize={10}
        fill="var(--muted-foreground)"
      >
        {PRACTICE_TARGET}%
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
            (width <= 450 && i === Math.floor((points.length - 1) / 2)) ||
            (width > 450 &&
              i % Math.max(1, Math.ceil(points.length / 6)) === 0),
        )
        .map((p) => (
          <text
            key={p.day}
            x={x(points.indexOf(p))}
            y={h - 6}
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
