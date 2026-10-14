# Airo 5.0

14 Oct 2026. **Built and unit-tested only; no paid Airo 5.0 eval run yet. No accuracy, feedback-quality or improvement numbers are claimed.** This is a combined marking-engine candidate and evaluation toolkit, with no deployment, new SQL migration or database change in this work.

The source design is `airo-plan-1330.md` and `airo-appendix.md` in the separate research workspace, especially appendix §7.3 (reconciliation), §7.5 (cost/power) and §7.10 (frozen splits). Component labels below name implementation tasks; the plan's proposed A0 baseline and A1 bare-prompt experiment are separate experiment labels.

## Components

| Component                    | Implementation and behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1: frozen sets              | `eval/sets.ts`, `sets/dev-ids.json` and `sets/final-ids.json`: 300 dev and 310 final marking_examples rows on 31 questions. Validate sizes, uniqueness, sorted order and disjointness. `--set=dev\|final` replaces the Held-out section; absent that flag, the existing test split remains. Missing frozen rows fail rather than silently shrinking the set.                                                                                                                                                   |
| A2: paired stats             | `eval/stats.ts` and `compare.mts`: exact, within-one, band agreement, signed bias, MAE, QWK by maximum and confusion counts. Pair by section/question/example identity, falling back to question occurrence for legacy rows without identity. Report invalid, incompatible and unpaired rows, exact McNemar and seeded whole-question bootstrap CIs, with and without hashed likely tutor-error flags.                                                                                                         |
| A3: feedback harness         | `eval/feedback/`: a separate accepted/rejected comment judge with evidence before verdict. Defaults to 200 balanced comments, seed 20261014, up to four balanced same-question context comments. Reports aggregate confusion and feedback metrics; this measures comment acceptance separately from mark accuracy. Dry-run estimates tokens and cost without a model call, but its default loader reads the database.                                                                                          |
| B1: retrieval and rationales | `marking/examples.ts` and `prompts.ts`: pass 1 keeps band anchors. For at least ten eligible whole-mark anchors, pass 2 waits for pass 1 and retrieves six by unigram/bigram TF-IDF cosine, with quotas at Airo's first mark and adjacent whole marks (two inward at an edge). Remaining slots fill by similarity. Small pools retain band anchors. Reconcile reuses pass 2's examples. Accepted tutor comment bodies are trimmed and capped at 1,200 characters per rationale; retrieval adds no model calls. |
| B2: uncertainty              | Initial passes with unequal marks set internal `feedback.flags.uncertain` and retain both marks, even after reconciliation or same-band agreement. Reports separate scored certain/uncertain groups. This supplies a routing signal; no new provisional-mark UX or automatic tutor queue is added.                                                                                                                                                                                                             |
| B3: checklists               | `marking/checklists.json`, `checklists.ts`, schemas and prompts: selected mock questions get ordered yes/no checks, exact quoted evidence and explicit mark effects before band selection. Empty evidence is allowed when no relevant span exists. Questions without a checklist get no checklist instructions or content. The schema permits the optional checklist; this is prompt guidance, not a deterministic checklist scorer.                                                                           |
| B4: reconcile re-score       | `eval/rescore.ts` and `rescore.mts`: apply current, higher, lower, first-pass-only and fractional midpoint rules to saved initial pass marks. Report exact, within-one, MAE, bias, disagreement-only results and paired gain CIs with/without flagged tutor marks. Shares A2's question bootstrap (seed 1415, 2,000 samples). Pooled observations cluster across runs by question. No production reconciliation rule changes.                                                                                  |
| S14: comment voice and tone  | `marking/prompts.ts`, `COMMENT-RULES.md`, `eval/tone.ts` and `report.ts`: warm, plain, direct second-person comments and next-mark advice, with five anonymous style examples in full grading only. Free lexical checks report stock phrases, second-person/imperative and third-person rates. Tone indicators are descriptive; they do not judge correctness or rewrite feedback.                                                                                                                             |

## Commands

Use Node 22 from the repository root. Run jobs through `q-run`, one at a time, with `NEXT_PUBLIC_APP_URL=http://localhost:3000 Q_SLOTS=1 Q_MIN_GB=3`. Commands below document future authorised use; the marking runner and default feedback loader require database access and must not run during an offline build-only task. Do not add real credentials to the repository.

### Dev and final marking runs (database and paid calls)

```bash
npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/run.mts --set=dev --label=airo-5-dev
npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/run.mts --set=final --label=airo-5-final
```

These commands also include the legacy A1 and Claro sections. `--limit=N` limits each section; `--items=i,j` selects positions in the full array and cannot combine with `--limit`. `--dry-run` still reads the database and writes rendered prompts containing answer text; it is not an offline-safe command. Minute-resolution result stamps can overwrite an earlier run in the same minute.

For exactly the proposed 300 dev answers, select only the Dev positions. Generate those positions locally from the legacy A1 fixture's length (no database or model access):

```bash
DEV_ITEMS=$(node -e 'const a1 = require("./src/lib/ai/eval/a1-eval-set.json"); console.log(Array.from({length: 300}, (_, i) => a1.length + i).join(","))')
npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/run.mts --set=dev --items="$DEV_ITEMS" --label=airo-5-dev
```

Use the same frozen set and item selection for the separately saved A0 current-engine baseline. `--label` records provenance; it does not switch engine versions. The A0 engine must also receive the same final-row and leave-self-out exclusions. No baseline-switch CLI or bare-prompt experiment arm is supplied here. Reserve final for the later release decision; do not use it to tune the candidate.

### Compare saved runs (free, local)

```bash
npx tsx src/lib/ai/eval/compare.mts baseline.json candidate.json --section=Dev --seed=20261014 --resamples=2000
npx tsx src/lib/ai/eval/compare.mts baseline-final.json candidate-final.json --section=Final
```

Default section is Held-out. Optional `--json=path` saves an aggregate report. Rates are fractions in JSON; rendered percentage deltas are percentage points. Band and QWK denominators are explicit. McNemar requires scored compatible pairs; question bootstrap retains every answer in each sampled question.

### Feedback dry-run (no model calls; default loader reads the database)

```bash
npx tsx --conditions=react-server --env-file=.env.local src/lib/ai/eval/feedback/run.mts --dry-run --limit=200 --seed=20261014
```

`--live` additionally calls the feedback judge and checks spend before each call; it requires separate authorisation. For a free offline verification, use `feedback/run.test.ts`: it injects synthetic rows and mocked model/spend functions, and rejects accidental admin/model imports. No offline JSON-loader CLI is provided. The dry-run prints aggregate counts and a cost estimate, not comment text or row IDs.

### Re-score saved pass marks (free, local)

```bash
npx tsx src/lib/ai/eval/rescore.mts
npx tsx src/lib/ai/eval/rescore.mts --file=path/to/saved-results.json
```

The default reads `sets/past-passes.json` and hashed `sets/flagged-tutor-marks.json`. It accepts a compact run map, rows, or an eval `{ items }` file. Failed, excluded, unscored and malformed rows are skipped and counted. It hashes raw example identities in memory and emits aggregate JSON only. Historical outputs describe older runs, not Airo 5.0 performance; no rule is selected automatically.

## Leak guards and student boundaries

- Frozen dev/final IDs are anonymous marking_examples row IDs. The research split excludes existing test rows and within-question TF-IDF near-duplicate groups (threshold 0.80); no answer text is copied into these lists. Half marks are outside these frozen whole-mark sets.
- The runner excludes every final ID from retrieval in all modes and the current dev row during dev marking. The grader view excludes test rows. Runtime retrieval uses explicit ID exclusions; it does not add a fresh near-duplicate search. The frozen split audit supplies that guard for these sets.
- Quotas use Airo's first-pass mark, never the target tutor mark. Tutor rationales come from eligible anchor rows. Checklists contain question rules rather than held-out answer text or identities. Student and anchor text is treated as evidence, never instructions.
- Feedback sampling excludes test/final rows and normalised duplicate answers of those rows. Same-question judge context excludes the target row and its normalised answer duplicates, and the target's label is absent from its prompt. Provenance and balance are checked before any judge call. This duplicate guard is normalised text equality, not semantic near-duplicate detection.
- Internal uncertainty flags and competing pass marks are stripped from student responses and practice/results loaders. Retrieved answers/rationales, checklist trace, band deliberations, judge labels, comparison statistics and tone diagnostics are not student feedback. Student comments, advice and outline still come from pass 1; the settled mark/band/justification follow the existing reconciliation rule.
- New shareable analysis uses hashed answer identities or research-file references. Keep raw run results, prompts and student data out of committed additions; only the frozen anonymous ID lists are intended to be shared directly.

## Proposed first paid test (not run)

A0 current-engine baseline versus Airo 5.0 on **`--set=dev`, 300 answers each**, using identical item selection and exclusions. At an estimated **$0.044–0.054 per answer**, 600 markings cost **$26.40–32.40, about $30 total**. These are planning estimates from historical cost and retrieval overhead, not a measured Airo 5.0 price. Additional legacy sections or judge calls would cost extra.

Save both runs with distinct labels and timestamps; compare Dev with paired McNemar, whole-question bootstrap, accuracy, bias and failures. Inspect per-question checklist behaviour, uncertainty and comment tone separately. The plan proposes stopping for more than 2% errors or cost above $0.06/answer, and a release gate of at least +4 percentage points with McNemar p < 0.05 and no worse signed bias. These are proposed decision rules, not results. Existing spend guards remain in force; this merge does not reset or bypass them. **The 310-answer final set stays untouched until a later authorised release test.**
