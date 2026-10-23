import type { ReactNode } from "react";
import Link from "next/link";
import { monotonePath } from "@/lib/chart-path";
import { cn } from "@/lib/utils";
import { PortalIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";

const clamp = (value: number) =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
export function DeltaPill({
  delta,
  unit = "",
  invert = false,
  neutral = false,
}: {
  delta: number;
  unit?: string;
  invert?: boolean;
  neutral?: boolean;
}) {
  const good = invert ? delta < 0 : delta > 0;
  return (
    <Badge
      data-component="DeltaPill"
      variant={!delta || neutral ? "muted" : good ? "success" : "warning"}
      className="h-5 gap-0.5 px-1.5 tabular-nums"
    >
      <PortalIcon
        name={
          !delta ? "minus" : delta > 0 ? "arrow-up-right" : "arrow-down-right"
        }
      />
      {delta > 0 ? "+" : delta < 0 ? "−" : ""}
      {Math.abs(delta)}
      {unit}
    </Badge>
  );
}
export function Sparkline({
  values,
  label = "Trend",
  width = 84,
  height = 34,
}: {
  values: number[];
  label?: string;
  width?: number;
  height?: number;
}) {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i): [number, number] => [
    3 + (i / Math.max(1, values.length - 1)) * (width - 6),
    height - 4 - (v / max) * (height - 8),
  ]);
  const last = pts.at(-1);
  return (
    <svg
      data-component="Sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="shrink-0 overflow-visible"
    >
      <path
        d={monotonePath(pts)}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeOpacity=".45"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && (
        <circle
          cx={last[0]}
          cy={last[1]}
          r="4"
          fill="var(--chart-2)"
          stroke="var(--card)"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}
export function StatCard({
  title,
  value,
  description,
  delta,
  unit,
  values,
  icon,
  empty = false,
}: {
  title: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  delta?: number;
  unit?: string;
  values?: number[];
  icon?: ReactNode;
  empty?: boolean;
}) {
  return (
    <Card data-component="StatCard" className="h-full gap-3">
      <CardHeader>
        <CardDescription className="self-center text-[13px]">
          {title}
        </CardDescription>
        {icon && (
          <span className="bg-muted text-muted-foreground col-start-2 row-start-1 grid size-8 place-items-center rounded-[12px]">
            {icon}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <p
            className={cn(
              "text-2xl leading-none font-bold tracking-tight tabular-nums sm:text-[28px]",
              empty &&
                "text-muted-foreground text-sm leading-6 font-normal tracking-normal sm:text-sm",
            )}
          >
            {value}
          </p>
          {!!values?.length && (
            <Sparkline
              values={values}
              label={typeof title === "string" ? `${title} trend` : "Trend"}
            />
          )}
        </div>
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          {delta !== undefined && <DeltaPill delta={delta} unit={unit} />}
          {description}
        </div>
      </CardContent>
    </Card>
  );
}
export function Meter({
  value,
  tone = "default",
  label,
  className,
}: {
  value: number;
  tone?: "default" | "brand" | "success";
  label: string;
  className?: string;
}) {
  return (
    <div
      data-component="Meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamp(value)}
      className={cn(
        "bg-chart-track h-1.5 w-full overflow-hidden rounded-full",
        tone === "brand" && "bg-brand-soft",
        className,
      )}
    >
      <div
        className={cn(
          "bg-chart-1 h-full rounded-full transition-[width] duration-500",
          tone === "brand" && "bg-brand",
          tone === "success" && "bg-success",
        )}
        style={{ width: `${clamp(value)}%` }}
      />
    </div>
  );
}
export function Progress({ value, label }: { value: number; label: string }) {
  return <Meter value={value} label={label} />;
}
export function Ring({
  value,
  max,
  size = 36,
  stroke = 4,
  tone = "default",
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  tone?: "default" | "brand";
}) {
  const r = (size - stroke) / 2,
    c = 2 * Math.PI * r;
  return (
    <svg
      data-component="Ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--chart-track)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tone === "brand" ? "var(--chart-2)" : "var(--chart-1)"}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(c * clamp(max > 0 ? (value / max) * 100 : 0)) / 100} ${c}`}
      />
    </svg>
  );
}
export function ScoreRing({
  score,
  of,
  size = 104,
  showPct = true,
}: {
  score: number;
  of: number;
  size?: number;
  showPct?: boolean;
}) {
  return (
    <div
      data-component="ScoreRing"
      className="relative grid shrink-0 place-items-center tabular-nums"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${score} out of ${of}`}
    >
      <Ring value={score} max={of} size={size} stroke={9} />
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-[26px] leading-none font-bold tracking-[-0.03em]">
          {score}
          <span className="text-muted-foreground text-[15px] font-semibold">
            /{of}
          </span>
        </span>
        {showPct && (
          <span className="text-muted-foreground mt-1 text-xs">
            {Math.round(clamp(of > 0 ? (score / of) * 100 : 0))}%
          </span>
        )}
      </div>
    </div>
  );
}
export function BarList({
  rows,
  unit = "",
  highlightFirst = true,
}: {
  rows: { label: string; value: number; href?: string }[];
  unit?: string;
  highlightFirst?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul data-component="BarList" className="grid gap-1">
      {rows.map((r, i) => {
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate font-medium">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {r.value}{" "}
                <span className="text-muted-foreground font-normal">
                  {unit}
                </span>
              </span>
            </span>
            <span className="block h-2">
              <span
                className={cn(
                  "bg-chart-3 block h-2 rounded-r-full",
                  highlightFirst && !i && "bg-chart-2",
                )}
                style={{ width: `${clamp((r.value / max) * 100)}%` }}
              />
            </span>
          </>
        );
        return (
          <li key={r.label}>
            {r.href ? (
              <Link
                href={r.href}
                className="hover:bg-accent grid gap-2 rounded-lg px-2 py-2.5"
              >
                {body}
              </Link>
            ) : (
              <div className="grid gap-2 px-2 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
export function TargetGauge({
  value,
  target = 80,
  size = 220,
}: {
  value: number;
  target?: number;
  size?: number;
}) {
  const point = (v: number, r: number) => {
    const a = Math.PI * (1 - v / 100);
    return [110 + Math.cos(a) * r, 105 - Math.sin(a) * r];
  };
  const [tx, ty] = point(clamp(target), 82),
    [ex, ey] = point(clamp(target), 102);
  return (
    <svg
      data-component="TargetGauge"
      width={size}
      viewBox="0 0 220 125"
      className="max-w-full"
      role="img"
      aria-label={`${value}% practice average; target ${target}%`}
    >
      {Array.from({ length: 51 }, (_, i) => {
        const [x, y] = point(i * 2, 82),
          [x2, y2] = point(i * 2, 99);
        return (
          <path
            key={i}
            d={`M${x} ${y}L${x2} ${y2}`}
            stroke={
              i * 2 <= clamp(value) ? "var(--chart-1)" : "var(--chart-track)"
            }
            strokeWidth="2.5"
          />
        );
      })}
      <path
        d={`M${tx} ${ty}L${ex} ${ey}`}
        stroke="var(--chart-2)"
        strokeWidth="3"
      />
      <text
        className="tabular-nums"
        x="110"
        y="83"
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize="32"
        fontWeight="700"
      >
        {value}%
      </text>
      <text
        x="110"
        y="104"
        textAnchor="middle"
        fill="var(--muted-foreground)"
        fontSize="10"
      >
        practice average
      </text>
    </svg>
  );
}
export function StatusBadge({
  status,
}: {
  status: "in-progress" | "unfinished" | "provisional" | "draft";
}) {
  const label = {
    "in-progress": "In progress",
    unfinished: "Not marked",
    provisional: "Provisional",
    draft: "Draft",
  }[status];
  return (
    <Badge
      variant={
        status === "unfinished"
          ? "warning"
          : status === "draft"
            ? "muted"
            : "outline"
      }
    >
      <PortalIcon
        name={
          status === "in-progress"
            ? "circle-dot"
            : status === "unfinished"
              ? "circle-alert"
              : status === "provisional"
                ? "hourglass"
                : "pen-line"
        }
      />
      {label}
    </Badge>
  );
}
export { Card, CardHeader, CardTitle, CardContent, CardDescription };
