import { z } from "zod";
import type { markWritten } from "@/lib/marking/engine";

export const JudgeSchema = z.strictObject({
  pros: z.array(
    z.strictObject({
      pro: z.string(),
      delivered: z.boolean(),
      evidence: z.string(),
    }),
  ),
  cons: z.array(
    z.strictObject({
      con: z.string(),
      fixed: z.boolean(),
      evidence: z.string(),
    }),
  ),
  score: z.number().int(),
  lowConfidence: z.boolean(),
  reasoning: z.string(),
});

export function renderFeedback(
  feedback: Awaited<ReturnType<typeof markWritten>>["feedback"],
): string {
  return [
    feedback.justification,
    ...feedback.comments.map(
      (c, i) =>
        `${i + 1}. [${c.kind === "strength" ? "Strength" : "Fix"} · ${c.tag}] "${c.quote}" — ${c.body}${c.kind === "fix" ? ` Next mark: ${c.next_mark}` : ""}`,
    ),
    `Next band: ${feedback.next_band}`,
    `Why not higher: ${feedback.why_not_higher}`,
    "Better-answer outline:",
    ...feedback.better_answer_outline.map((point) => `- ${point}`),
  ].join("\n");
}
