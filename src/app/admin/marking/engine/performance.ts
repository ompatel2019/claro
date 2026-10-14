import { summarise } from "@/lib/ai/eval/metrics";
import type { OfflineEvalRun } from "./summary";

export type Benchmark = "heldout-196" | "a1-18";
type Metrics = {
  exact?: number | null;
  within1?: number | null;
  meanSigned?: number | null;
  usdPerAnswer?: number | null;
  secondsPerAnswer?: number | null;
};
type PerformanceValue = Metrics & {
  sameQuestionExamples: boolean | null;
  source: string;
};
export type PerformanceRow = { airo: string; values: PerformanceValue[] };

// Only headline numbers recorded in src/lib/ai/docs/CHANGELOG.md.
const backfill: Record<string, Partial<Record<Benchmark, PerformanceValue>>> = {
  "1.0": {
    "a1-18": {
      exact: 0.333,
      within1: 0.889,
      meanSigned: 0.67,
      usdPerAnswer: 0.0107,
      secondsPerAnswer: 12.1,
      sameQuestionExamples: null,
      source: "Airo 1.0 — Baseline, run 0901",
    },
  },
  "2.0": {
    "a1-18": {
      exact: 0.333,
      within1: 0.889,
      meanSigned: 0.67,
      usdPerAnswer: 0.0149,
      secondsPerAnswer: 12.1,
      sameQuestionExamples: null,
      source: "Airo 2.0 — blind second pass + reconcile, run 0920",
    },
  },
  "2.1": {
    "a1-18": {
      exact: 0.444,
      within1: 0.889,
      meanSigned: 0.44,
      usdPerAnswer: 0.0178,
      secondsPerAnswer: 13.8,
      sameQuestionExamples: null,
      source: "Airo 2.1 — band-descriptor element check, run 0940",
    },
    "heldout-196": {
      exact: 0.449,
      within1: 0.944,
      meanSigned: 0.15,
      usdPerAnswer: 0.0234,
      secondsPerAnswer: 15.2,
      sameQuestionExamples: null,
      source:
        "Airo 3.0 / 3.1 — band-anchored examples, run 1159 (shipped 0940 engine / Airo 2.1)",
    },
  },
  "3.0": {
    "a1-18": {
      exact: 0.444,
      within1: 0.889,
      meanSigned: 0.44,
      usdPerAnswer: 0.0198,
      secondsPerAnswer: 12.5,
      sameQuestionExamples: true,
      source: "Airo 3.0 / 3.1 — band-anchored examples, run 1211",
    },
    "heldout-196": {
      exact: 0.459,
      within1: 0.954,
      meanSigned: 0.08,
      usdPerAnswer: 0.0274,
      secondsPerAnswer: 16,
      sameQuestionExamples: true,
      source: "Airo 3.0 / 3.1 — band-anchored examples, run 1211",
    },
  },
  "3.1": {
    "a1-18": {
      exact: 0.444,
      within1: 0.889,
      meanSigned: 0.44,
      usdPerAnswer: 0.0206,
      secondsPerAnswer: 13.3,
      sameQuestionExamples: true,
      source: "Airo 3.0 / 3.1 — band-anchored examples, run 1222",
    },
    "heldout-196": {
      exact: 0.434,
      within1: 0.964,
      meanSigned: 0.05,
      usdPerAnswer: 0.0286,
      secondsPerAnswer: 16,
      sameQuestionExamples: true,
      source: "Airo 3.0 / 3.1 — band-anchored examples, run 1222",
    },
  },
  "4.0": {
    "a1-18": {
      exact: 0.611,
      within1: 0.944,
      meanSigned: 0.39,
      usdPerAnswer: 0.0329,
      secondsPerAnswer: 11,
      sameQuestionExamples: null,
      source: "Airo 4.0 → 4.1 — Sonnet before format retry, run 1415",
    },
    "heldout-196": {
      exact: 0.459,
      within1: 0.969,
      meanSigned: 0.07,
      usdPerAnswer: 0.0442,
      secondsPerAnswer: 12.7,
      sameQuestionExamples: null,
      source:
        "Airo 4.0 → 4.1 — Sonnet before format retry, run 1415 (194/196 successful)",
    },
  },
  "4.1": {},
  "4.2": {},
};

export function buildPerformance(
  runs: OfflineEvalRun[],
  benchmark: Benchmark,
): PerformanceRow[] {
  const versions = new Set(Object.keys(backfill));
  const latest = new Map<string, Map<boolean | null, OfflineEvalRun>>();
  for (const run of runs) {
    const { meta } = run;
    if (!meta.airo || !meta.benchmark?.includes(benchmark)) continue;
    versions.add(meta.airo);
    // Subsets and unfinished runs must not replace full benchmark measurements.
    if (
      meta.items != null ||
      meta.limit != null ||
      meta.blocked ||
      (meta.status && meta.status !== "completed")
    )
      continue;
    const flag = meta.sameQuestionExamples ?? null;
    const variants =
      latest.get(meta.airo) ?? new Map<boolean | null, OfflineEvalRun>();
    const previous = variants.get(flag);
    if (
      !previous ||
      (meta.startedAt ?? meta.stamp) >
        (previous.meta.startedAt ?? previous.meta.stamp)
    )
      variants.set(flag, run);
    latest.set(meta.airo, variants);
  }
  return [...versions]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((airo) => {
      const historical = backfill[airo]?.[benchmark];
      const values: PerformanceValue[] = [
        ...(latest.get(airo)?.entries() ?? []),
      ].map(([flag, run]) => {
        const section = benchmark === "heldout-196" ? "Held-out" : "A1";
        const items = run.items.filter(
          (item) =>
            item.section === section &&
            !item.flags?.excluded &&
            (section === "Held-out" || (!item.error && item.mark != null)),
        );
        const computed = summarise(
          items.map((item) => {
            const valid =
              !item.error &&
              Number.isFinite(item.mark) &&
              typeof item.expected === "number" &&
              Number.isFinite(item.expected);
            const delta = valid ? item.mark! - (item.expected as number) : null;
            return {
              score:
                delta == null
                  ? undefined
                  : {
                      delta,
                      exact: delta === 0,
                      within1: Math.abs(delta) <= 1,
                      band: item.score?.band === true,
                    },
              usd: item.usd ?? NaN,
              seconds: item.seconds ?? NaN,
            };
          }),
        );
        const recorded =
          (benchmark === "heldout-196" ? run.heldOut : run.headline) ??
          computed;
        return {
          ...recorded,
          sameQuestionExamples: flag,
          source: `Recorded run ${run.meta.id ?? run.meta.stamp}`,
        };
      });
      // Retain the historical configuration if the only newer run has the opposite flag.
      if (
        historical &&
        !values.some(
          (v) =>
            historical.sameQuestionExamples === null ||
            v.sameQuestionExamples === historical.sameQuestionExamples,
        )
      )
        values.unshift(historical);
      return {
        airo,
        values: values.length
          ? values
          : [{ sameQuestionExamples: null, source: "No measurement recorded" }],
      };
    });
}
