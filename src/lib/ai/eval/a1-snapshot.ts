import { z } from "zod";
import type { MarkableQuestion } from "@/lib/marking/grade";
import { splitExamples } from "./split";

const SnapshotSchema = z
  .array(
    z.object({
      question: z.string().min(1),
      source_hash: z.string().regex(/^[a-f0-9]{32}$/),
      answer_text: z.string().trim().min(1),
      tutor_mark: z.number().finite().nonnegative(),
      accepted_tutor_comments: z.array(z.unknown()),
      rejected_ai_comments: z.array(z.unknown()),
    }),
  )
  .min(1);
const normalise = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

/** Validate the private, anonymised read-only export before any database access. */
export function prepareA1Snapshot(
  snapshot: unknown,
  questions: MarkableQuestion[],
  evalAnswers: string[],
) {
  const rows = SnapshotSchema.parse(snapshot);
  const bank = new Map(questions.map((q) => [q.id, q]));
  const hashes = new Set<string>();
  const answers = new Set(evalAnswers.map(normalise));
  for (const row of rows) {
    const q = bank.get(row.question);
    if (!q) throw new Error(`Unknown question ${row.question}`);
    if (row.tutor_mark > q.marks)
      throw new Error(`Tutor mark exceeds maximum (${row.question})`);
    if (hashes.has(row.source_hash))
      throw new Error(`Duplicate source hash (${row.question})`);
    // A repeated answer under a different source hash can leak across the split.
    if (answers.has(normalise(row.answer_text)))
      throw new Error(`Duplicate or benchmark answer (${row.question})`);
    hashes.add(row.source_hash);
    answers.add(normalise(row.answer_text));
  }
  return splitExamples(rows).map((row) => {
    const q = bank.get(row.question)!;
    return {
      question_id: `a1-${row.question}`,
      answer_text: row.answer_text,
      tutor_mark: row.tutor_mark,
      band:
        q.criteria.find(
          (c) => row.tutor_mark >= c.min && row.tutor_mark <= c.max,
        )?.descriptor ?? null,
      accepted_tutor_comments: row.accepted_tutor_comments,
      rejected_ai_comments: row.rejected_ai_comments,
      split: row.split,
      origin: "a1",
      source_hash: row.source_hash,
    };
  });
}
