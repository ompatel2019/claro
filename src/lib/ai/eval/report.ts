import type { z } from "zod";
import type { markWritten } from "@/lib/marking/engine";
import type { JudgeSchema } from "./judge";
import type { scoreItem } from "./metrics";

export type Row = {
  id: string;
  exampleId?: string;
  feedbackComments?: Awaited<
    ReturnType<typeof markWritten>
  >["feedback"]["comments"];
  section: string;
  label: string;
  marks: number | null;
  expected: number | number[];
  mark: number | null;
  band: string | null;
  check: Awaited<ReturnType<typeof markWritten>>["check"] | null;
  delta: number | null;
  flags: {
    excluded?: string;
    validated?: boolean;
    uncertain?: boolean;
    inRange?: boolean;
    lowConfidence?: boolean;
  };
  usd: number;
  judgeUsd: number;
  seconds: number;
  verdict: z.infer<typeof JudgeSchema> | null;
  feedback: string | null;
  error: string | null;
  score?: ReturnType<typeof scoreItem>;
  firstScore?: ReturnType<typeof scoreItem>;
};
