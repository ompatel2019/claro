import "server-only";
import { admin } from "@/utils/supabase/admin";
import type { MarkableQuestion } from "@/lib/marking/grade";
import type { MarkedExample } from "@/lib/marking/example-selection";
import { retrievalPool, type EvalAnswer } from "./sets";

/** Eval-only pool: filter before either band or quota selection. */
export async function evalExamplePool(
  q: MarkableQuestion,
  answer: EvalAnswer,
  excludedIds: readonly string[] = [],
) {
  const { data } = await admin()
    .from("marking_examples")
    .select(
      "id, question_id, split, source_hash, answer_text, tutor_mark, accepted_tutor_comments",
    )
    .eq("question_id", q.id)
    .eq("split", "example")
    .order("id")
    .throwOnError();
  const excluded = new Set(excludedIds);
  return retrievalPool(
    (data ?? []) as (MarkedExample & {
      id: string;
      question_id: string;
      split: string;
      source_hash: string;
    })[],
    undefined,
    answer,
  ).filter((row) => !excluded.has(row.id));
}
