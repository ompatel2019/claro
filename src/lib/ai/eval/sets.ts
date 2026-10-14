import devIds from "./sets/dev-ids.json";
import finalIds from "./sets/final-ids.json";

export type EvalSet = "dev" | "final";

export function validateSets(dev: readonly string[], final: readonly string[]) {
  if (dev.length !== 300 || final.length !== 310)
    throw new Error("Frozen eval sets must contain 300 dev and 310 final ids");
  for (const ids of [dev, final]) {
    if (new Set(ids).size !== ids.length)
      throw new Error("Frozen eval sets must contain unique ids");
    if (ids.some((id, index) => index > 0 && id < ids[index - 1]))
      throw new Error("Frozen eval sets must be sorted");
  }
  const finalSet = new Set(final);
  if (dev.some((id) => finalSet.has(id)))
    throw new Error("Frozen dev and final sets must not overlap");
}

validateSets(devIds, finalIds);
export const evalSets: Record<EvalSet, readonly string[]> = {
  dev: devIds,
  final: finalIds,
};

/** Preserve the frozen ID order and fail rather than silently evaluating a partial set. */
export function evalRows<T extends { id: string; question_id: string }>(
  rows: readonly T[],
  set: EvalSet,
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return evalSets[set].map((id) => {
    const row = byId.get(id);
    if (!row) throw new Error(`Missing frozen ${set} eval row`);
    return row;
  });
}

/** Both frozen sets are locked out in every eval mode. */
export function retrievalExclusions(_set?: EvalSet, rowId?: string): string[] {
  return [
    ...new Set([...evalSets.dev, ...evalSets.final, ...(rowId ? [rowId] : [])]),
  ];
}

export type EvalAnswer = {
  id?: string;
  answer_text: string;
  source_hash?: string;
};

const normaliseAnswer = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function retrievalPool<
  T extends {
    id: string;
    question_id: string;
    split: string;
    answer_text: string;
    source_hash?: string;
  },
>(rows: readonly T[], set?: EvalSet, answer?: EvalAnswer): T[] {
  const excluded = new Set(retrievalExclusions(set, answer?.id));
  return rows.filter(
    (row) =>
      row.split === "example" &&
      !excluded.has(row.id) &&
      (!answer ||
        normaliseAnswer(row.answer_text) !==
          normaliseAnswer(answer.answer_text)) &&
      (!answer?.source_hash || row.source_hash !== answer.source_hash),
  );
}
