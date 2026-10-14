import "server-only";

import { admin } from "@/utils/supabase/admin";
import type { Criterion, MarkableQuestion } from "./grade";

export type MarkedExample = {
  answer_text: string;
  tutor_mark: number;
  accepted_tutor_comments?: unknown;
};

function terms(text: string): Map<string, number> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const counts = new Map<string, number>();
  for (let i = 0; i < words.length; i++) {
    for (const term of [
      words[i],
      ...(i ? [`${words[i - 1]} ${words[i]}`] : []),
    ])
      counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return counts;
}

/** Six anchors: exact first-pass mark, adjacent mark bands, then similarity. */
export function pickQuotaExamples(
  q: Pick<MarkableQuestion, "criteria" | "marks">,
  examples: MarkedExample[],
  answer: string,
  firstMark: number,
): MarkedExample[] {
  const whole = examples.filter(
    (e) =>
      Number.isInteger(e.tutor_mark) &&
      e.tutor_mark >= 0 &&
      e.tutor_mark <= q.marks,
  );
  // The appendix's coverage experiment uses questions with at least ten pool rows.
  if (whole.length < 10) return pickBandExamples(q.criteria, examples);
  const documents = whole.map((e) => terms(e.answer_text));
  const frequency = new Map<string, number>();
  for (const doc of documents)
    for (const term of doc.keys())
      frequency.set(term, (frequency.get(term) ?? 0) + 1);
  const vector = (doc: Map<string, number>) => {
    const weighted = new Map<string, number>();
    let norm = 0;
    for (const [term, count] of doc) {
      const weight =
        count *
        (1 + Math.log((whole.length + 1) / ((frequency.get(term) ?? 0) + 1)));
      weighted.set(term, weight);
      norm += weight * weight;
    }
    return { weighted, norm: Math.sqrt(norm) };
  };
  const target = vector(terms(answer));
  const ranked = documents
    .map((doc, index) => {
      const candidate = vector(doc);
      let dot = 0;
      for (const [term, weight] of target.weighted)
        dot += weight * (candidate.weighted.get(term) ?? 0);
      const denominator = target.norm * candidate.norm;
      return { index, score: denominator ? dot / denominator : 0 };
    })
    // Equal scores follow the pool's database id order.
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const start = Math.max(0, Math.min(firstMark - 1, q.marks - 2));
  const quotas = [
    firstMark,
    ...Array.from(
      { length: Math.min(3, q.marks + 1) },
      (_, i) => start + i,
    ).filter((mark) => mark !== firstMark),
  ];
  const selected = new Set<number>();
  for (const mark of quotas) {
    // The closest adjacent-band answer is the near-miss anchor. Missing bands
    // cannot satisfy a quota; available slots are still filled by similarity.
    const match = ranked.find(
      ({ index }) => !selected.has(index) && whole[index].tutor_mark === mark,
    );
    if (match) selected.add(match.index);
  }
  for (const { index } of ranked) {
    if (selected.size === 6) break;
    selected.add(index);
  }
  return [...selected].map((index) => whole[index]);
}

/**
 * Band anchors for the grader: up to two tutor-marked answers for each band (and for 0),
 * highest band first. Whole tutor marks only, so every anchor sits squarely in one band.
 */
export function pickBandExamples(
  criteria: Criterion[],
  examples: MarkedExample[],
): MarkedExample[] {
  const whole = examples.filter((e) => Number.isInteger(Number(e.tutor_mark)));
  return [...criteria]
    .sort((a, b) => b.max - a.max)
    .concat({ min: 0, max: 0, descriptor: "" })
    .flatMap(({ min, max }) =>
      whole
        .filter(
          (e) => Number(e.tutor_mark) >= min && Number(e.tutor_mark) <= max,
        )
        .slice(0, 2),
    );
}

/** Eligible pool in stable id order; the grader view excludes split 'test' rows. */
export async function examplePool(
  q: MarkableQuestion,
  excludedIds: readonly string[] = [],
) {
  let query = admin()
    .from("marking_examples_for_grader")
    .select("answer_text, tutor_mark, accepted_tutor_comments")
    .eq("question_id", q.id);
  if (excludedIds.length)
    query = query.not("id", "in", `(${excludedIds.join(",")})`);
  const { data, error } = await query.order("id");
  if (error) throw new Error(`marking examples: ${error.message}`);
  return (data ?? []) as MarkedExample[];
}

export async function bandExamples(
  q: MarkableQuestion,
  excludedIds: readonly string[] = [],
) {
  return pickBandExamples(q.criteria, await examplePool(q, excludedIds));
}
