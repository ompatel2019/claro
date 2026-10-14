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
  distractors: z.object({
    A: paragraph.min(1).optional(),
    B: paragraph.min(1).optional(),
    C: paragraph.min(1).optional(),
    D: paragraph.min(1).optional(),
  }),
});
export type McqExplanation = z.infer<typeof McqExplanationSchema>;

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
