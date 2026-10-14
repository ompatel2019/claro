import {
  Card,
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
import type { PerformanceRow } from "./performance";

const number = (
  value: number | null | undefined,
  digits: number,
  percent = false,
) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : `${(percent ? value * 100 : value).toFixed(digits)}${percent ? "%" : ""}`;

export function PerformanceView({
  heldout,
  a1,
}: {
  heldout: PerformanceRow[];
  a1: PerformanceRow[];
}) {
  return (
    <div className="min-w-0 space-y-4">
      {(
        [
          ["heldout-196", heldout],
          ["a1-18", a1],
        ] as const
      ).map(([benchmark, rows]) => (
        <Card key={benchmark} className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>{benchmark}</h2>
            </CardTitle>
            <CardDescription>
              Latest full run per version and same-question examples setting;
              otherwise recorded changelog figures. Lean is mean signed mark
              error (+ lenient, − strict). Cost and time are marking only, per
              answer. Missing measurements are —. Historical 4.0 held-out
              figures used 194/196 successful answers; newer runs count failures
              as misses.
            </CardDescription>
            <a
              href="/admin/marking/engine?tab=docs&doc=CHANGELOG"
              className="text-sm underline"
            >
              Changelog sources
            </a>
          </CardHeader>
          <Table aria-label={`${benchmark} performance`}>
            <TableHeader>
              <TableRow>
                {[
                  "Airo",
                  "Exact %",
                  "Within-one %",
                  "Lean",
                  "Cost per answer",
                  "Seconds per answer",
                  "Same-question examples",
                ].map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.airo}>
                  <TableCell>{row.airo}</TableCell>
                  {(
                    [
                      "exact",
                      "within1",
                      "meanSigned",
                      "usdPerAnswer",
                      "secondsPerAnswer",
                      "sameQuestionExamples",
                    ] as const
                  ).map((key) => (
                    <TableCell key={key} className="tabular-nums">
                      {row.values.map((value, index) => (
                        <div
                          key={index}
                          title={value.source}
                          className="whitespace-nowrap"
                        >
                          {key === "sameQuestionExamples"
                            ? value[key] === null
                              ? "—"
                              : value[key]
                                ? "On"
                                : "Off"
                            : key === "usdPerAnswer"
                              ? Number.isFinite(value[key]) &&
                                value[key] != null
                                ? `$${number(value[key], 4)}`
                                : "—"
                              : number(
                                  value[key],
                                  key === "secondsPerAnswer"
                                    ? 1
                                    : key === "exact" || key === "within1"
                                      ? 1
                                      : 2,
                                  key === "exact" || key === "within1",
                                )}
                        </div>
                      ))}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
