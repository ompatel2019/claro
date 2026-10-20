import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { compareRows, type EvalRow } from "./stats";

const usage =
  "Usage: npx tsx scripts/eval/compare.mts <baseline.json> <candidate.json> [--section=Held-out|Dev|Final] [--seed=N] [--resamples=2000] [--json=path]";

export function parseArgs(args: string[]) {
  const files: string[] = [];
  let section = "Held-out",
    seed = 1,
    resamples = 2000,
    json: string | undefined;
  const seen = new Set<string>();
  for (const arg of args) {
    if (!arg.startsWith("--")) {
      files.push(arg);
      continue;
    }
    const match = /^--(section|seed|resamples|json)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw new Error(usage);
    const [, key, value] = match;
    seen.add(key);
    if (key === "section") section = value;
    if (key === "json") json = value;
    if (key === "seed" || key === "resamples") {
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new Error(usage);
      if (key === "seed") seed = Number(value);
      else resamples = Number(value);
    }
  }
  if (
    files.length !== 2 ||
    !["Held-out", "Dev", "Final"].includes(section) ||
    resamples < 1
  )
    throw new Error(usage);
  return {
    baseline: files[0],
    candidate: files[1],
    section,
    seed,
    resamples,
    json,
  };
}

export function readItems(contents: string): EvalRow[] {
  const data = JSON.parse(contents);
  if (
    !data ||
    !Array.isArray(data.items) ||
    !data.items.every(
      (r: unknown) =>
        r !== null &&
        typeof r === "object" &&
        "id" in r &&
        typeof r.id === "string" &&
        "section" in r &&
        typeof r.section === "string" &&
        (!("exampleId" in r) ||
          r.exampleId === undefined ||
          typeof r.exampleId === "string"),
    )
  )
    throw new Error(
      "Expected an eval result object with an items array of rows",
    );
  return data.items;
}

export function renderReport(report: ReturnType<typeof compareRows>) {
  const fmt = (n: number | null, percent = false) =>
    n === null
      ? "—"
      : `${(n * (percent ? 100 : 1)).toFixed(percent ? 2 : 4)}${percent ? "%" : ""}`;
  const ci = (interval: [number, number] | null, percent = false) =>
    interval
      ? `[${fmt(interval[0], percent)}, ${fmt(interval[1], percent)}]`
      : "—";
  const keys = [
    ["exact", "Exact", true],
    ["within1", "Within-1", true],
    ["band", "Band accuracy", true],
    ["signedBias", "Signed bias (marks)", false],
    ["biasShare", "Signed bias (share of max)", true],
    ["mae", "MAE", false],
    ["qwk", "QWK", false],
  ] as const;
  const sections = (
    [
      ["All rows", report.all],
      ["Excluding flagged likely tutor errors", report.excludingFlagged],
    ] as const
  ).map(([title, s]) => {
    const table = keys
      .map(
        ([key, label, percent]) =>
          `| ${label} | ${fmt(s.baseline[key], percent)} | ${fmt(s.candidate[key], percent)} | ${fmt(s.pairedBaseline[key], percent)} | ${fmt(s.pairedCandidate[key], percent)} | ${fmt(s.difference[key], percent)} |`,
      )
      .join("\n");
    const confusion = (
      [
        ["Baseline", s.baseline],
        ["Candidate", s.candidate],
        ["Paired baseline", s.pairedBaseline],
        ["Paired candidate", s.pairedCandidate],
      ] as const
    )
      .flatMap(([name, m]) =>
        m.byMax.flatMap((g) =>
          g.confusion.map(
            (cell) =>
              `| ${name} | ${g.max} | ${cell.expected} | ${cell.mark} | ${cell.n} |`,
          ),
        ),
      )
      .join("\n");
    return [
      `## ${title}`,
      `Excluded flagged rows: baseline ${s.excludedBaseline}, candidate ${s.excludedCandidate}. Missing exampleId (cannot independently match flags): baseline ${s.missingExampleIdBaseline}, candidate ${s.missingExampleIdCandidate}.`,
      `Errors/unscored/excluded/invalid: baseline ${s.invalidBaseline}, candidate ${s.invalidCandidate}. Unpaired: baseline ${s.unpairedBaseline}, candidate ${s.unpairedCandidate}. Matched pairs dropped: ${s.invalidPairs} invalid, ${s.incompatiblePairs} with different tutor marks or maxima.`,
      `Scored: baseline ${s.baseline.n}, candidate ${s.candidate.n}; scored pairs ${s.pairedBaseline.n}. Band denominators: ${s.baseline.bandN}/${s.candidate.bandN} (paired ${s.pairedBaseline.bandN}/${s.pairedCandidate.bandN}). QWK denominators: ${s.baseline.qwkN}/${s.candidate.qwkN} (paired ${s.pairedBaseline.qwkN}/${s.pairedCandidate.qwkN}).`,
      `| Metric | Baseline | Candidate | Paired baseline | Paired candidate | Paired Δ |\n| --- | --- | --- | --- | --- | --- |\n${table}`,
      `McNemar exact two-sided: b=${s.mcnemar.b}, c=${s.mcnemar.c}, p=${fmt(s.mcnemar.p)}.`,
      `Question bootstrap (${s.bootstrap.questions} questions), 95% percentile CIs: exact Δ ${ci(s.bootstrap.exact, true)}; signed-bias Δ ${ci(s.bootstrap.signedBias)} marks.`,
      `### Confusion counts by maximum\n\n| Run | Max | Tutor | AI | Count |\n| --- | --- | --- | --- | --- |\n${confusion}`,
    ].join("\n\n");
  });
  return (
    [
      `# Paired marking comparison: ${report.section}`,
      `Seed ${report.seed}; ${report.resamples} resamples. Δ = candidate − baseline; percentage differences are percentage points. Positive bias means over-marking. Bootstrap resamples whole questions with replacement and retains all answers in each question.`,
      "QWK is computed separately by question maximum and averaged with answer-count weights; undefined constant-rating groups are omitted and their denominator is shown. Confusion tables use tutor marks as rows and AI marks as columns (sparse counts). Band agreement uses stored score.band or the existing sameBand logic when criteria are supplied; unavailable bands are omitted, and paired band metrics require band agreement on both sides. Missing example IDs use question occurrence within section; different known IDs never match by occurrence. Flagged matches use question ID plus SHA-256(exampleId); both sides of a matched flagged pair are removed.",
      ...sections,
    ].join("\n\n") + "\n"
  );
}

export function main(args: string[]) {
  const options = parseArgs(args);
  const baseline = readItems(readFileSync(options.baseline, "utf8"));
  const candidate = readItems(readFileSync(options.candidate, "utf8"));
  const flags = JSON.parse(
    readFileSync(
      new URL(
        "../../src/lib/ai/eval/sets/flagged-tutor-marks.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const report = compareRows(baseline, candidate, flags, options);
  if (options.json)
    writeFileSync(options.json, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(renderReport(report));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
