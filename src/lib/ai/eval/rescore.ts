import { z } from "zod";

const rowSchema = z.object({
  id: z.string().min(1), // Question id, shared by all answers to that question.
  exampleIdSha256: z.string().optional(),
  marks: z.number().nonnegative(),
  expected: z.number().nonnegative(),
  mark: z.number().nonnegative(),
  check: z.object({ marks: z.array(z.number().nonnegative()).min(2) }),
});
export type RescoreRow = z.infer<typeof rowSchema>;
export const RULES = [
  "current",
  "higher",
  "lower",
  "first-pass-only",
  "midpoint",
] as const;
export type RescoreRule = (typeof RULES)[number];
export const BOOTSTRAP = { seed: 1415, samples: 2000 } as const;

export function ruleMark(row: RescoreRow, rule: RescoreRule): number {
  const [first, second] = row.check.marks;
  switch (rule) {
    case "current":
      return row.mark;
    case "higher":
      return Math.max(first, second);
    case "lower":
      return Math.min(first, second);
    case "first-pass-only":
      return first;
    case "midpoint":
      return (first + second) / 2;
  }
}

/** Accept the compact run map, a row array, or an eval results { items } file.
 * Results files use Held-out/Dev/Final sections when present, otherwise all rows.
 * Unscored, excluded, errored, and malformed rows are counted as skipped.
 */
export function readRescoreRuns(input: unknown) {
  const object = z.record(z.string(), z.unknown());
  const data = Array.isArray(input) ? { file: input } : object.parse(input);
  const groups = "items" in data ? { file: data.items } : data;
  return Object.entries(groups).map(([name, values]) => {
    let candidates = z.array(z.unknown()).parse(values);
    if ("items" in data) {
      const sections = new Set(["Held-out", "Dev", "Final"]);
      const heldOut = candidates.filter(
        (row) =>
          typeof row === "object" &&
          row !== null &&
          "section" in row &&
          sections.has(String(row.section)),
      );
      if (heldOut.length) candidates = heldOut;
    }
    const rows: RescoreRow[] = [];
    for (const value of candidates) {
      if (typeof value === "object" && value !== null) {
        if ("error" in value && value.error) continue;
        if (
          "flags" in value &&
          typeof value.flags === "object" &&
          value.flags !== null &&
          "excluded" in value.flags &&
          value.flags.excluded
        )
          continue;
      }
      const row = rowSchema.safeParse(value);
      if (
        row.success &&
        [row.data.expected, row.data.mark, ...row.data.check.marks].every(
          (mark) => mark <= row.data.marks,
        )
      )
        rows.push(row.data);
    }
    return { name, rows, skipped: candidates.length - rows.length };
  });
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paired percentile CI for exact-rate gain (fractions, not percentage points).
 * Sample whole questions with replacement, retaining every answer/observation.
 * Pooled runs share question clusters, including repeat observations.
 */
function gainInterval(rows: RescoreRow[], rule: RescoreRule) {
  if (!rows.length) return null;
  const questions = new Map<string, { n: number; gain: number }>();
  for (const row of rows) {
    const group = questions.get(row.id) ?? { n: 0, gain: 0 };
    group.n++;
    group.gain +=
      Number(ruleMark(row, rule) === row.expected) -
      Number(row.mark === row.expected);
    questions.set(row.id, group);
  }
  const groups = [...questions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => group);
  const next = random(BOOTSTRAP.seed);
  const gains = Array.from({ length: BOOTSTRAP.samples }, () => {
    let n = 0;
    let gain = 0;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[Math.floor(next() * groups.length)];
      n += group.n;
      gain += group.gain;
    }
    return gain / n;
  }).sort((a, b) => a - b);
  // Linear interpolation at the 2.5th and 97.5th percentiles.
  const quantile = (p: number) => {
    const index = (gains.length - 1) * p;
    const low = Math.floor(index);
    return gains[low] + (gains[Math.ceil(index)] - gains[low]) * (index - low);
  };
  return { low: quantile(0.025), high: quantile(0.975) };
}

export function rescore(rows: RescoreRow[]) {
  const n = rows.length;
  const disagreements = rows.filter(
    (row) => row.check.marks[0] !== row.check.marks[1],
  );
  const currentExact = rows.filter((row) => row.mark === row.expected).length;
  return RULES.map((rule) => {
    const deltas = rows.map((row) => ruleMark(row, rule) - row.expected);
    const exact = deltas.filter((delta) => delta === 0).length;
    const mean = (sum: number) => (n ? sum / n : null);
    const disagreementExact = disagreements.filter(
      (row) => ruleMark(row, rule) === row.expected,
    ).length;
    return {
      rule,
      n,
      exactCount: exact,
      exact: mean(exact),
      within1: mean(deltas.filter((delta) => Math.abs(delta) <= 1).length),
      mae: mean(deltas.reduce((sum, delta) => sum + Math.abs(delta), 0)),
      signedBias: mean(deltas.reduce((sum, delta) => sum + delta, 0)),
      disagreements: disagreements.length,
      disagreementExactCount: disagreementExact,
      disagreementExact: disagreements.length
        ? disagreementExact / disagreements.length
        : null,
      gainVsCurrent: mean(exact - currentExact),
      gain95: gainInterval(rows, rule),
    };
  });
}

export function rescoreReport(
  runs: ReturnType<typeof readRescoreRuns>,
  flaggedHashes: readonly string[],
) {
  const flagged = new Set(flaggedHashes);
  const pooled = {
    name: "pooled",
    rows: runs.flatMap((run) => run.rows),
    skipped: runs.reduce((sum, run) => sum + run.skipped, 0),
  };
  return {
    bootstrap: BOOTSTRAP,
    units: "Rates and gains are fractions; MAE and signed bias are marks.",
    pooling: "All run observations; clustered by question across runs.",
    runs: [...runs, pooled].map(({ name, rows, skipped }) => {
      const clean = rows.filter(
        (row) => !flagged.has(row.exampleIdSha256 ?? ""),
      );
      return {
        name,
        skipped,
        flagged: rows.length - clean.length,
        missingExampleHash: rows.filter((row) => !row.exampleIdSha256).length,
        withFlagged: rescore(rows),
        withoutFlagged: rescore(clean),
      };
    }),
  };
}
