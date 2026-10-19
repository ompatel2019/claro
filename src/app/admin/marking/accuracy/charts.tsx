"use client";
import { monotonePath } from "@/lib/chart-path";

import { useId, useState } from "react";
import { Button, EmptyState } from "@/components/claro";
import { PortalIcon } from "@/components/icons";
import {
  Card,
  CardContent,
  CardAction,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateLabel } from "@/lib/practice";
import type { Week } from "./data";
import { percentage } from "./helpers";

export const statusLabels = ["Agreed", "Second pass", "In review", "Reviewed"];
const colours = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-track"];

function ChartViewButton({
  view,
  setView,
}: {
  view: "chart" | "table";
  setView: (view: "chart" | "table") => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={view === "chart" ? "Show as table" : "Show as chart"}
      onClick={() => setView(view === "chart" ? "table" : "chart")}
    >
      <PortalIcon name={view === "chart" ? "table-2" : "chart-line"} />
    </Button>
  );
}

export function WeeklyChart({
  weeks,
  kind,
}: {
  weeks: Week[];
  kind: "agreement" | "disputes";
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const gradientId = useId().replaceAll(":", "");
  const agreement = kind === "agreement";
  const title = agreement
    ? "Agreement per week"
    : "Disputes per 100 written answers";
  const points = weeks.map((w) => ({
    ...w,
    value: agreement
      ? percentage(w.agreed, w.checked)
      : percentage(w.disputes, w.written),
  }));
  const hasData = points.some((p) => p.value != null);
  const W = 600,
    H = 220,
    LEFT = 64,
    RIGHT = 16,
    TOP = 12,
    BOTTOM = 176;
  const maximum = agreement
    ? 100
    : Math.max(1, Math.ceil(Math.max(...points.map((p) => p.value ?? 0))));
  const x = (i: number) =>
    LEFT + (i / Math.max(1, points.length - 1)) * (W - LEFT - RIGHT);
  const y = (value: number) => TOP + (1 - value / maximum) * (BOTTOM - TOP);
  // Missing weeks split the curve and fill; never bridge a week with no answers.
  const segments: [number, number][][] = [];
  points.forEach((p, i) => {
    if (p.value == null) return;
    if (i === 0 || points[i - 1].value == null) segments.push([]);
    segments.at(-1)!.push([x(i), y(p.value)]);
  });
  const line = segments.map(monotonePath).join(" ");
  const summary = points
    .map(
      (p) =>
        `Week of ${dateLabel(p.day)}: ${p.value == null ? (agreement ? "no checked answers" : "no written answers") : `${p.value.toFixed(1)}${agreement ? "%" : " per 100"}`}`,
    )
    .join("; ");
  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>
          Monday-start weeks in Sydney; first and last weeks may be partial.
        </CardDescription>
        {hasData && (
          <CardAction>
            <ChartViewButton view={view} setView={setView} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="relative flex-1">
        {!hasData ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center text-center">
            {agreement ? "No checked answers yet" : "No written answers yet"}
          </div>
        ) : view === "table" ? (
          <div className="max-h-[220px] overflow-auto rounded-lg border">
            <Table aria-label={title}>
              <TableHeader className="bg-card sticky top-0">
                <TableRow>
                  <TableHead>Week starting (Sydney)</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Numerator</TableHead>
                  <TableHead className="text-right">Denominator</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((p) => (
                  <TableRow key={p.day}>
                    <TableCell>{p.day}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.value == null
                        ? "No answers"
                        : `${p.value.toFixed(1)}${agreement ? "%" : " per 100"}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {agreement ? p.agreed : p.disputes}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {agreement ? p.checked : p.written}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${title}. ${summary}`}
            className="h-auto w-full"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--chart-1)" stopOpacity=".12" />
                <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, maximum / 2, maximum].map((tick) => (
              <g key={tick}>
                <text
                  x={LEFT - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-chart-axis text-[11px] tabular-nums"
                >
                  {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                  {agreement ? "%" : ""}
                </text>
                <line
                  x1={LEFT}
                  x2={W - RIGHT}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-chart-grid"
                />
              </g>
            ))}
            {segments
              .filter((segment) => segment.length > 1)
              .map((segment, i) => (
                <path
                  key={i}
                  d={`${monotonePath(segment)} L${segment.at(-1)![0]},${BOTTOM} L${segment[0][0]},${BOTTOM} Z`}
                  fill={`url(#${gradientId})`}
                />
              ))}
            <path
              d={line}
              fill="none"
              className="stroke-chart-1"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((p, i) =>
              p.value == null ? null : (
                <circle
                  key={p.day}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={4.5}
                  strokeWidth={2}
                  className={
                    i === points.findLastIndex((point) => point.value != null)
                      ? "fill-chart-2 stroke-card"
                      : "fill-chart-1 stroke-card"
                  }
                >
                  <title>{`Week of ${dateLabel(p.day)}: ${p.value.toFixed(1)}${agreement ? "%" : " per 100"}; ${agreement ? `${p.agreed} of ${p.checked} checked` : `${p.disputes} disputes / ${p.written} written answers`}`}</title>
                </circle>
              ),
            )}
            <text x={LEFT} y={H - 12} className="fill-chart-axis text-[11px]">
              {dateLabel(points[0].day)}
            </text>
            {points.length > 1 && (
              <text
                x={W - RIGHT}
                y={H - 12}
                textAnchor="end"
                className="fill-chart-axis text-[11px]"
              >
                {dateLabel(points.at(-1)!.day)}
              </text>
            )}
          </svg>
        )}
      </CardContent>
    </Card>
  );
}
export function CategoryBar({
  mix,
}: {
  mix: { status: string; count: number }[];
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const total = mix.reduce((sum, part) => sum + part.count, 0);
  if (!total)
    return (
      <EmptyState
        title="No checked answers yet"
        description="The check status mix will appear once written answers have been checked."
      />
    );
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Check status mix</h2>
        </CardTitle>
        <CardDescription>{total} checked written answers</CardDescription>
        <CardAction>
          <ChartViewButton view={view} setView={setView} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {view === "chart" ? (
          <>
            <div
              role="img"
              aria-label={mix
                .map(
                  (p, i) =>
                    `${statusLabels[i]}: ${p.count} (${((p.count / total) * 100).toFixed(1)}%)`,
                )
                .join("; ")}
              className="flex h-3 w-full overflow-hidden rounded-full"
            >
              {mix.map((p, i) => (
                <div
                  key={p.status}
                  className={colours[i]}
                  style={{ width: `${(p.count / total) * 100}%` }}
                />
              ))}
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {mix.map((p, i) => (
                <li
                  key={p.status}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2.5 shrink-0 rounded-full ${colours[i]}`}
                  />
                  <span>{statusLabels[i]}</span>
                  <span className="ml-auto tabular-nums">
                    {p.count} · {((p.count / total) * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="overflow-auto rounded-lg border">
            <Table aria-label="Check status mix data">
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Answers</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mix.map((part, index) => (
                  <TableRow key={part.status}>
                    <TableCell>{statusLabels[index]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {part.count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {((part.count / total) * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
