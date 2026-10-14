import { z } from "zod";
import data from "./checklists.json";

// Drafted from airo-appendix.md §4 and §6 tutor notes; no answer text.
// The mock fixture uses m*-* refs; imported question IDs have the a1- prefix.
export const ChecklistsSchema = z.record(
  z.string().regex(/^a1-m[2-4]-\d{2}[abc]$/),
  z
    .array(
      z.strictObject({
        id: z.string().min(1),
        check: z.string().endsWith("?"),
        evidence: z.string().min(1),
        effect: z.string().min(1),
      }),
    )
    .min(1)
    .refine(
      (checks) =>
        new Set(checks.map((check) => check.id)).size === checks.length,
      "Check IDs must be unique within a question",
    ),
);

export const checklists = ChecklistsSchema.parse(data);
