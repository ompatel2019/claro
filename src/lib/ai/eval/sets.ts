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

/** Final rows are locked out in every mode; dev rows additionally leave themselves out. */
export function retrievalExclusions(set?: EvalSet, rowId?: string): string[] {
  return set === "dev" && rowId
    ? [...evalSets.final, rowId]
    : [...evalSets.final];
}

export function retrievalPool<
  T extends { id: string; question_id: string; split: string },
>(rows: readonly T[], set?: EvalSet, rowId?: string): T[] {
  const excluded = new Set(retrievalExclusions(set, rowId));
  return rows.filter((row) => row.split === "example" && !excluded.has(row.id));
}
