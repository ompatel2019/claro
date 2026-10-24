import { monotonePath } from "@/lib/chart-path";
import { PRACTICE_TARGET } from "@/lib/progress";
import type { TrendPoint } from "@/lib/progress-insights";

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
/** "26 Jul" from a YYYY-MM-DD day. */
export const shortDay = (day: string) =>
  `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

/**
 * Practice average over the range: one point per bucket, gaps where nothing was
 * practised, the target as a dashed line. The same numbers sit in a table for
 * screen readers.
 */
export function PracticeTrend({
  points,
  size,
}: {
  points: TrendPoint[];
  size: number;
}) {
  const n = points.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (pct: number) => 100 - pct;
  const runs: [number, number][][] = [];
  points.forEach((p, i) => {
    if (p.pct == null) return;
    const prev = points[i - 1];
    if (!prev || prev.pct == null) runs.push([]);
    runs[runs.length - 1].push([x(i), y(p.pct)]);
  });
  const last = points.findLastIndex((p) => p.pct != null);
  const ticks = [
    ...new Set([0, 1, 2, 3, 4].map((k) => Math.round((k * (n - 1)) / 4))),
  ];
  const unit = size === 1 ? "Day" : size === 7 ? "Week of" : "From";
  return (
    <div className="progress-trend">
      <div className="progress-trend-plot" aria-hidden="true">
        {[100, 75, 50, 25, 0].map((v) => (
          <span
            key={v}
            className="progress-trend-y"
            style={{ top: `${y(v)}%` }}
          >
            {v}%
          </span>
        ))}
        <div className="progress-trend-area">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {[100, 75, 50, 25, 0].map((v) => (
              <line
                key={v}
                className="grid"
                x1="0"
                x2="100"
                y1={y(v)}
                y2={y(v)}
              />
            ))}
            <line
              className="target"
              x1="0"
              x2="100"
              y1={y(PRACTICE_TARGET)}
              y2={y(PRACTICE_TARGET)}
            />
            {runs
              .filter((r) => r.length > 1)
              .map((r) => {
                const line = monotonePath(r);
                return (
                  <g key={r[0][0]}>
                    <path
                      className="wash"
                      d={`${line}L${r[r.length - 1][0]},100L${r[0][0]},100Z`}
                    />
                    <path className="line" d={line} />
                  </g>
                );
              })}
          </svg>
          {points.map((p, i) =>
            p.pct == null || (i !== last && hasNeighbour(points, i)) ? null : (
              <i
                key={p.day}
                className={i === last ? "dot is-end" : "dot"}
                style={{ left: `${x(i)}%`, top: `${y(p.pct)}%` }}
              />
            ),
          )}
          {last >= 0 && (
            <b
              className="progress-trend-end"
              style={{ left: `${x(last)}%`, top: `${y(points[last].pct!)}%` }}
            >
              {points[last].pct}%
            </b>
          )}
        </div>
        <div className="progress-trend-x">
          {ticks.map((i) => (
            <span key={i} style={{ left: `${x(i)}%` }}>
              {shortDay(points[i].day)}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Practice average by {size === 1 ? "day" : "period"}</caption>
        <thead>
          <tr>
            <th scope="col">{unit}</th>
            <th scope="col">Average</th>
            <th scope="col">Sessions</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{shortDay(p.day)}</th>
              <td>{p.pct == null ? "No practice" : `${p.pct}%`}</td>
              <td>{p.sessions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const hasNeighbour = (points: TrendPoint[], i: number) =>
  points[i - 1]?.pct != null || points[i + 1]?.pct != null;
