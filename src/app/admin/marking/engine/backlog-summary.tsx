import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { latestEval } from "../accuracy/data";
import { runDateLabel, type OfflineEvalRun } from "./summary";

export function BacklogSummary({ runs }: { runs: OfflineEvalRun[] }) {
  const result = latestEval(runs);
  const percent = (value: number | null) =>
    value === null ? "—" : `${(value * 100).toFixed(1)}%`;
  return (
    <Card aria-label="A1 mock backlog calibration">
      <CardHeader>
        <CardTitle>A1 mock backlog calibration</CardTitle>
        <CardDescription>
          Agreement with human marks on held-out mock scripts. These answers are
          kept out of calibration examples; student disputes do not affect this
          result.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {result ? (
          <>
            <p className="text-muted-foreground text-sm break-words">
              Latest full backlog run: {runDateLabel(result.stamp)} ·{" "}
              {result.model}
              {result.label && ` · ${result.label}`}
            </p>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["Scored scripts", String(result.n)],
                ["Exact human mark", percent(result.exact)],
                ["Human-mark agreement", percent(result.agreement)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-sm">{label}</dt>
                  <dd className="mt-1 text-[28px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground text-sm">
              Agreement means the same guideline band, and within one mark for
              questions worth six or more marks. Failed and excluded scripts are
              omitted. Partial runs and the separate Karan benchmark are
              omitted.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            No full held-out backlog evaluation yet. Human-mark agreement will
            appear after a full offline backlog run is saved.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
