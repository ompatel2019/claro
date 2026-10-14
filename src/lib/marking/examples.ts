import "server-only";

import { admin } from "@/utils/supabase/admin";
import type { MarkableQuestion } from "./grade";

export {
  pickBandExamples,
  pickQuotaExamples,
  type MarkedExample,
} from "./example-selection";
import { pickBandExamples, type MarkedExample } from "./example-selection";

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
