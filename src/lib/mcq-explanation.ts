import { z } from "zod";

const paragraph = z.string().trim();
export const McqExplanationDraftSchema = z.object({
  concept: paragraph,
  why_correct: paragraph,
  distractors: z.object({
    A: paragraph.optional(),
    B: paragraph.optional(),
    C: paragraph.optional(),
    D: paragraph.optional(),
  }),
});
export const McqExplanationSchema = McqExplanationDraftSchema.extend({
  concept: paragraph.min(1),
  why_correct: paragraph.min(1),
  // Publishing checks note completeness against the question's correct index.
});
export type McqExplanation = z.infer<typeof McqExplanationSchema>;

export function withoutCorrectOptionNote(
  explanation: McqExplanation,
  correctIndex: number | null,
): McqExplanation {
  const distractors = { ...explanation.distractors };
  if (correctIndex !== null)
    delete distractors["ABCD"[correctIndex] as keyof typeof distractors];
  return { ...explanation, distractors };
}

/** Structured explanations live as JSON in the existing text column. */
export function readMcqExplanation(
  value: unknown,
  draft = false,
): McqExplanation | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const result = (
    draft ? McqExplanationDraftSchema : McqExplanationSchema
  ).safeParse(value);
  return result.success ? result.data : null;
}
