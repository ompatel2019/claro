import { createHash } from "node:crypto";
import { sameBand } from "@/lib/ai/eval/metrics";

export type EvalRow = {
  id: string;
  exampleId?: string;
  section: string;
  marks: number | null;
  expected: number | number[];
  mark: number | null;
  band?: string | null;
  error?: string | null;
  flags?: { excluded?: string };
  score?: { band: boolean };
  criteria?: Parameters<typeof sameBand>[0];
};
export type FlaggedMark = { question: string; exampleIdSha256: string };
type ScoredRow = EvalRow & { marks: number; expected: number; mark: number };
export type Pair = { baseline: ScoredRow; candidate: ScoredRow };
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function isScored(row: EvalRow): row is ScoredRow {
  return (
    !row.error &&
    !row.flags?.excluded &&
    typeof row.expected === "number" &&
    Number.isFinite(row.expected) &&
    typeof row.mark === "number" &&
    Number.isFinite(row.mark) &&
    typeof row.marks === "number" &&
    Number.isInteger(row.marks) &&
    row.marks > 0 &&
    row.expected >= 0 &&
    row.expected <= row.marks &&
    row.mark >= 0 &&
    row.mark <= row.marks
  );
}

export function isFlagged(row: EvalRow, flags: readonly FlaggedMark[]) {
  if (!row.exampleId) return false;
  const hash = createHash("sha256").update(row.exampleId).digest("hex");
  return flags.some((f) => f.question === row.id && f.exampleIdSha256 === hash);
}

/** Occurrences include failed rows. Two different known IDs never fall back. */
export function pairRows(baseline: EvalRow[], candidate: EvalRow[]) {
  const indexed = (rows: EvalRow[]) => {
    const counts = new Map<string, number>();
    return rows.map((row) => {
      const key = JSON.stringify([row.section, row.id]);
      const occurrence = counts.get(key) ?? 0;
      counts.set(key, occurrence + 1);
      return { row, key: JSON.stringify([row.section, row.id, occurrence]) };
    });
  };
  const left = indexed(baseline),
    right = indexed(candidate);
  const used = new Set<number>();
  const matches = new Map<number, number>();
  // Reserve all identity matches before allowing legacy occurrence matches.
  left.forEach(({ row }, i) => {
    if (!row.exampleId) return;
    const j = right.findIndex(
      ({ row: other }, j) =>
        !used.has(j) &&
        other.section === row.section &&
        other.id === row.id &&
        other.exampleId === row.exampleId,
    );
    if (j >= 0) {
      matches.set(i, j);
      used.add(j);
    }
  });
  left.forEach(({ row, key }, i) => {
    if (matches.has(i)) return;
    const j = right.findIndex(
      ({ row: other, key: otherKey }, j) =>
        !used.has(j) &&
        key === otherKey &&
        (!row.exampleId || !other.exampleId),
    );
    if (j >= 0) {
      matches.set(i, j);
      used.add(j);
    }
  });
  return {
    pairs: [...matches]
      .sort(([a], [b]) => a - b)
      .map(([i, j]) => ({ baseline: left[i].row, candidate: right[j].row })),
    unpairedBaseline: left.length - matches.size,
    unpairedCandidate: right.length - matches.size,
  };
}

/** Exact two-sided binomial test, accumulated in log space to avoid underflow. */
export function mcnemarExact(b: number, c: number) {
  if (![b, c].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Discordant counts must be nonnegative integers");
  const n = b + c;
  let logTerm = -n * Math.LN2,
    logSum = logTerm;
  for (let k = 1; k <= Math.min(b, c); k++) {
    logTerm += Math.log(n - k + 1) - Math.log(k);
    const high = Math.max(logSum, logTerm);
    logSum =
      high + Math.log(Math.exp(logSum - high) + Math.exp(logTerm - high));
  }
  return Math.min(1, 2 * Math.exp(logSum));
}

/** Quadratic distances also support fractional marks without rounding. */
export function quadraticWeightedKappa(rows: readonly ScoredRow[]) {
  if (!rows.length) return null;
  const observed =
    rows.reduce((sum, r) => sum + (r.mark - r.expected) ** 2, 0) / rows.length;
  const expected = mean(rows.map((r) => r.expected))!;
  const marked = mean(rows.map((r) => r.mark))!;
  const chance =
    mean(rows.map((r) => r.expected ** 2))! +
    mean(rows.map((r) => r.mark ** 2))! -
    2 * expected * marked;
  return chance === 0 ? null : 1 - observed / chance;
}

function bandAgreement(row: ScoredRow): boolean | null {
  const band =
    row.score?.band ??
    (row.criteria ? sameBand(row.criteria, row.expected, row.mark) : null);
  return typeof band === "boolean" ? band : null;
}

export function metrics(rows: ScoredRow[]) {
  const groups = new Map<number, ScoredRow[]>();
  for (const row of rows)
    groups.set(row.marks, [...(groups.get(row.marks) ?? []), row]);
  const byMax = [...groups]
    .sort(([a], [b]) => a - b)
    .map(([max, group]) => {
      const counts = new Map<
        string,
        { expected: number; mark: number; n: number }
      >();
      for (const r of group) {
        const key = `${r.expected}:${r.mark}`;
        const cell = counts.get(key) ?? {
          expected: r.expected,
          mark: r.mark,
          n: 0,
        };
        cell.n++;
        counts.set(key, cell);
      }
      return {
        max,
        n: group.length,
        qwk: quadraticWeightedKappa(group),
        confusion: [...counts.values()].sort(
          (a, b) => a.expected - b.expected || a.mark - b.mark,
        ),
      };
    });
  const defined = byMax.filter((g) => g.qwk !== null);
  const qwkN = defined.reduce((sum, g) => sum + g.n, 0);
  const bands = rows.flatMap((r) => {
    const band = bandAgreement(r);
    return band === null ? [] : [Number(band)];
  });
  return {
    n: rows.length,
    exact: mean(rows.map((r) => Number(r.mark === r.expected))),
    within1: mean(rows.map((r) => Number(Math.abs(r.mark - r.expected) <= 1))),
    band: mean(bands),
    bandN: bands.length,
    signedBias: mean(rows.map((r) => r.mark - r.expected)),
    biasShare: mean(rows.map((r) => (r.mark - r.expected) / r.marks)),
    mae: mean(rows.map((r) => Math.abs(r.mark - r.expected))),
    qwk: qwkN ? defined.reduce((sum, g) => sum + g.qwk! * g.n, 0) / qwkN : null,
    qwkN,
    byMax,
  };
}

export function bootstrap(pairs: Pair[], seed = 1, resamples = 2000) {
  if (
    !Number.isSafeInteger(seed) ||
    !Number.isSafeInteger(resamples) ||
    resamples < 1
  )
    throw new Error(
      "Seed must be an integer; resamples must be a positive integer",
    );
  const groups = new Map<string, Pair[]>();
  for (const p of pairs) {
    const key = JSON.stringify([p.baseline.section, p.baseline.id]);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const questions = [...groups.values()];
  if (!questions.length) return { questions: 0, exact: null, signedBias: null };
  let state = seed >>> 0;
  const random = () => {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const exact: number[] = [],
    bias: number[] = [];
  for (let i = 0; i < resamples; i++) {
    const sample = questions.flatMap(
      () => questions[Math.floor(random() * questions.length)],
    );
    exact.push(
      mean(
        sample.map(
          (p) =>
            Number(p.candidate.mark === p.candidate.expected) -
            Number(p.baseline.mark === p.baseline.expected),
        ),
      )!,
    );
    bias.push(mean(sample.map((p) => p.candidate.mark - p.baseline.mark))!);
  }
  const interval = (values: number[]): [number, number] => {
    values.sort((a, b) => a - b);
    const quantile = (p: number) => {
      const position = (values.length - 1) * p,
        lower = Math.floor(position);
      return (
        values[lower] +
        (values[Math.ceil(position)] - values[lower]) * (position - lower)
      );
    };
    return [quantile(0.025), quantile(0.975)];
  };
  return {
    questions: questions.length,
    exact: interval(exact),
    signedBias: interval(bias),
  };
}

export function compareRows(
  baseline: EvalRow[],
  candidate: EvalRow[],
  flags: readonly FlaggedMark[],
  options: { section?: string; seed?: number; resamples?: number } = {},
) {
  const section = options.section ?? "Held-out",
    seed = options.seed ?? 1,
    resamples = options.resamples ?? 2000;
  const left = baseline.filter((r) => r.section === section),
    right = candidate.filter((r) => r.section === section);
  const run = (exclude: boolean) => {
    // Remove both sides of a flagged pair, even when one legacy row lacks its ID.
    const paired = pairRows(left, right);
    const rejected = new Set<EvalRow>();
    if (exclude) {
      for (const r of [...left, ...right])
        if (isFlagged(r, flags)) rejected.add(r);
      for (const p of paired.pairs)
        if (rejected.has(p.baseline) || rejected.has(p.candidate)) {
          rejected.add(p.baseline);
          rejected.add(p.candidate);
        }
    }
    const l = left.filter((r) => !rejected.has(r)),
      r = right.filter((r) => !rejected.has(r));
    const retained = paired.pairs.filter(
      (p) => !rejected.has(p.baseline) && !rejected.has(p.candidate),
    );
    const pairs: Pair[] = [];
    let invalidPairs = 0,
      incompatiblePairs = 0;
    for (const p of retained) {
      if (!isScored(p.baseline) || !isScored(p.candidate)) {
        invalidPairs++;
        continue;
      }
      if (
        p.baseline.expected !== p.candidate.expected ||
        p.baseline.marks !== p.candidate.marks
      ) {
        incompatiblePairs++;
        continue;
      }
      pairs.push({ baseline: p.baseline, candidate: p.candidate });
    }
    const base = metrics(pairs.map((p) => p.baseline)),
      cand = metrics(pairs.map((p) => p.candidate));
    const bandPairs = pairs.filter(
      (p) =>
        bandAgreement(p.baseline) !== null &&
        bandAgreement(p.candidate) !== null,
    );
    base.band = mean(bandPairs.map((p) => Number(bandAgreement(p.baseline))));
    cand.band = mean(bandPairs.map((p) => Number(bandAgreement(p.candidate))));
    base.bandN = cand.bandN = bandPairs.length;
    const keys = [
      "exact",
      "within1",
      "band",
      "signedBias",
      "biasShare",
      "mae",
      "qwk",
    ] as const;
    const difference = Object.fromEntries(
      keys.map((key) => [
        key,
        base[key] === null || cand[key] === null
          ? null
          : cand[key]! - base[key]!,
      ]),
    );
    const b = pairs.filter(
      (p) =>
        p.baseline.mark === p.baseline.expected &&
        p.candidate.mark !== p.candidate.expected,
    ).length;
    const c = pairs.filter(
      (p) =>
        p.baseline.mark !== p.baseline.expected &&
        p.candidate.mark === p.candidate.expected,
    ).length;
    return {
      excludedBaseline: left.length - l.length,
      excludedCandidate: right.length - r.length,
      missingExampleIdBaseline: l.filter((r) => !r.exampleId).length,
      missingExampleIdCandidate: r.filter((r) => !r.exampleId).length,
      invalidBaseline: l.filter((r) => !isScored(r)).length,
      invalidCandidate: r.filter((r) => !isScored(r)).length,
      unpairedBaseline:
        paired.unpairedBaseline -
        left.filter(
          (r) => rejected.has(r) && !paired.pairs.some((p) => p.baseline === r),
        ).length,
      unpairedCandidate:
        paired.unpairedCandidate -
        right.filter(
          (r) =>
            rejected.has(r) && !paired.pairs.some((p) => p.candidate === r),
        ).length,
      invalidPairs,
      incompatiblePairs,
      baseline: metrics(l.filter(isScored)),
      candidate: metrics(r.filter(isScored)),
      pairedBaseline: base,
      pairedCandidate: cand,
      difference,
      mcnemar: { b, c, p: pairs.length ? mcnemarExact(b, c) : null },
      bootstrap: bootstrap(pairs, seed, resamples),
    };
  };
  return {
    section,
    seed,
    resamples,
    all: run(false),
    excludingFlagged: run(true),
  };
}
