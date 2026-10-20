// Local JSON only: no database or model imports.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { pickQuotaExamples } from "@/lib/marking/example-selection";

const Input = z
  .object({
    question: z.object({
      marks: z.number().int().positive(),
      criteria: z.array(
        z.object({
          min: z.number().int().nonnegative(),
          max: z.number().int().nonnegative(),
          descriptor: z.string(),
        }),
      ),
    }),
    pool: z.array(
      z.object({
        answer_text: z.string(),
        tutor_mark: z.number(),
        accepted_tutor_comments: z.unknown().optional(),
      }),
    ),
    answer: z.string(),
    firstMark: z.number().int().nonnegative(),
  })
  .refine((input) => input.firstMark <= input.question.marks, {
    message: "firstMark must not exceed question.marks",
  });

/** Preview the check/reconcile anchors from an already eligible, ordered pool. */
export function previewQuotaExamples(input: unknown) {
  const { question, pool, answer, firstMark } = Input.parse(input);
  return pickQuotaExamples(question, pool, answer, firstMark);
}

export function quotaPreviewCli(
  args: string[],
  read: (path: string) => string = (path) => readFileSync(path, "utf8"),
  write: (text: string) => void = console.log,
) {
  if (args.length !== 1 || !/^--file=.+$/.test(args[0]))
    throw new Error("Usage: quota-preview.mts --file=path/to/preview.json");
  write(
    JSON.stringify(
      previewQuotaExamples(JSON.parse(read(args[0].slice(7)))),
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  quotaPreviewCli(process.argv.slice(2));
