"use client";
import { useId, useState } from "react";
import {
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/claro";
import { monotonePathAbove } from "@/lib/chart-path";
import { PortalIcon } from "@/components/icons";
import { dateLabel } from "@/lib/practice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const W = 600;
const H = 220;
const TOP = 12;
const RIGHT = 12;
const LEFT = 72;
const BOTTOM = H - 28;
const modelOpacity = [1, 0.78, 0.58, 0.4, 0.25];

/** K10 ChartCard: title, hero number, an area or stacked bars per Sydney day. */
export function DailyChart({
  title,
  description,
  hero,
  points,
  kind,
  dayPicker = true,
}: {
  title: string;
  description?: string;
  hero: string;
  points: { day: string; value: number; models?: Record<string, number> }[];
  kind: "area" | "bars";
  /** The "Day" select under the chart. Hover titles and the table view still give each day. */
  dayPicker?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const gradientId = useId().replaceAll(":", "");
  const format = (v: number) =>
    kind === "bars" ? `$${v.toFixed(2)}` : String(v);
  const current = points.find((p) => p.day === selected) ?? points.at(-1);
  const models = [
    ...new Set(points.flatMap((p) => Object.keys(p.models ?? {}))),
  ].sort();
  const max = Math.max(
    kind === "bars" ? 0.01 : 1,
    ...points.map((p) => p.value),
  );
  const step = (W - LEFT - RIGHT) / Math.max(1, points.length);
  const x = (i: number) => LEFT + (i + 0.5) * step;
  const y = (v: number) => TOP + (1 - v / max) * (BOTTOM - TOP);
  const line = monotonePathAbove(
    points.map((p, i) => [x(i), y(p.value)]),
    BOTTOM,
  );
  const bar = Math.min(24, step * 0.58);
  const ticks = [0, max / 2, max];
  return (
    <Card className="min-w-0">
      <CardHeader className="grid-cols-[1fr_auto]">
        <div>
          <CardTitle role="heading" aria-level={2}>
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
          <p className="num-display mt-2 text-[30px] leading-none font-bold">
            {hero}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={view === "chart" ? "Show as table" : "Show as chart"}
          onClick={() =>
            setView((currentView) =>
              currentView === "chart" ? "table" : "chart",
            )
          }
        >
          <PortalIcon name={view === "chart" ? "table-2" : "chart-line"} />
        </Button>
      </CardHeader>
      <CardContent>
        {view === "chart" ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label={
              models.length
                ? `${title}, Sydney dates, stacked by model`
                : `${title}, ${points.length} Sydney days`
            }
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--chart-1)" stopOpacity=".12" />
                <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={LEFT}
                  x2={W - RIGHT}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-chart-grid"
                />
                <text
                  x={LEFT - 10}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-chart-axis text-[11px] tabular-nums"
                >
                  {format(tick)}
                </text>
              </g>
            ))}
            {points.length > 0 && (
              <>
                <text
                  x={LEFT}
                  y={H - 6}
                  className="fill-chart-axis text-[11px]"
                >
                  {dateLabel(points[0].day)}
                </text>
                <text
                  x={W - RIGHT}
                  y={H - 6}
                  textAnchor="end"
                  className="fill-chart-axis text-[11px]"
                >
                  {dateLabel(points.at(-1)!.day)}
                </text>
              </>
            )}
            {kind === "area" && points.length > 1 && (
              <>
                <path
                  d={`${line}L${x(points.length - 1)},${BOTTOM}L${x(0)},${BOTTOM}Z`}
                  fill={`url(#${gradientId})`}
                />
                <path
                  d={line}
                  fill="none"
                  className="stroke-chart-1"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {points.map((p, i) => (
              <g
                key={p.day}
                onMouseEnter={() => setSelected(p.day)}
                onClick={() => setSelected(p.day)}
              >
                <title>{`${dateLabel(p.day)} (Sydney) · ${format(p.value)}`}</title>
                {kind === "bars" ? (
                  models.length ? (
                    models.map((model, index) => {
                      const value = p.models?.[model] ?? 0;
                      const base = models
                        .slice(0, index)
                        .reduce(
                          (sum, name) => sum + (p.models?.[name] ?? 0),
                          0,
                        );
                      const highlighted =
                        i === points.length - 1 && index === models.length - 1;
                      return (
                        <rect
                          key={model}
                          x={x(i) - bar / 2}
                          y={y(base + value)}
                          width={bar}
                          height={y(base) - y(base + value)}
                          fill={
                            highlighted ? "var(--chart-2)" : "var(--chart-1)"
                          }
                          fillOpacity={
                            highlighted
                              ? 1
                              : modelOpacity[index % modelOpacity.length]
                          }
                        >
                          <title>{`${dateLabel(p.day)} (Sydney) · ${model}: ${format(value)}`}</title>
                        </rect>
                      );
                    })
                  ) : (
                    <rect
                      x={x(i) - bar / 2}
                      y={y(p.value)}
                      width={bar}
                      height={BOTTOM - y(p.value)}
                      rx={4}
                      className={
                        i === points.length - 1
                          ? "fill-chart-2"
                          : "fill-chart-3"
                      }
                    />
                  )
                ) : (
                  <circle
                    cx={x(i)}
                    cy={y(p.value)}
                    r={p.day === current?.day ? 4.5 : 8}
                    strokeWidth={2}
                    className={
                      p.day === current?.day
                        ? "fill-chart-2 stroke-card"
                        : "hover:fill-chart-1/30 fill-transparent"
                    }
                  />
                )}
              </g>
            ))}
          </svg>
        ) : (
          <div className="max-h-[220px] overflow-auto rounded-lg border">
            <Table aria-label={`${title} data`}>
              <TableHeader className="bg-card sticky top-0">
                <TableRow>
                  <TableHead>Date (Sydney)</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {models.map((model) => (
                    <TableHead key={model} className="text-right">
                      {model}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((point) => (
                  <TableRow key={point.day}>
                    <TableCell>{dateLabel(point.day)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {format(point.value)}
                    </TableCell>
                    {models.map((model) => (
                      <TableCell
                        key={model}
                        className="text-right tabular-nums"
                      >
                        {format(point.models?.[model] ?? 0)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {models.length > 0 && (
          <ul
            aria-label="Models"
            className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm"
          >
            {models.map((model, index) => (
              <li
                key={model}
                className="flex max-w-full min-w-0 shrink-0 items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: "var(--chart-1)",
                    opacity: modelOpacity[index % modelOpacity.length],
                  }}
                />
                <span className="min-w-0 wrap-anywhere">{model}</span>
              </li>
            ))}
          </ul>
        )}
        {dayPicker && current && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Day</span>
            <Select
              items={points.map((p) => ({
                value: p.day,
                label: dateLabel(p.day),
              }))}
              value={current.day}
              onValueChange={(day) => setSelected(day)}
            >
              <SelectTrigger aria-label={`${title} day`} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {points.map((p) => (
                  <SelectItem key={p.day} value={p.day}>
                    {dateLabel(p.day)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <output className="font-medium tabular-nums" aria-live="polite">
              {format(current.value)}
              {models.map((model) => (
                <span key={model} className="ml-2 inline-block wrap-anywhere">
                  {model}: {format(current.models?.[model] ?? 0)}
                </span>
              ))}
            </output>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
