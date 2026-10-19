import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, vi } from "vitest";

// Makes live (paid) model calls. Run only on purpose:
//   S16_EVAL=1 npx vitest run --config scripts/s16-eval/vitest.config.ts
if (process.env.S16_EVAL !== "1")
  throw new Error("S16 eval: set S16_EVAL=1 and use its own vitest config.");
import { MARKER, markWritten } from "@/lib/marking/engine";
import type { MarkableQuestion } from "@/lib/marking/grade";
import { assessOwnCriteria } from "@/lib/marking/own-criteria";
import { ownQuestionSchema } from "@/lib/single-check";

const usage = vi.hoisted(() => ({
  total: 0,
  pending: new Set<Promise<unknown>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env/server", () => ({ serverEnv: () => ({}) }));
vi.mock("@/lib/ai/spend", () => ({
  openRouterSpend: async () => usage.total,
}));
vi.mock("@/utils/supabase/admin", () => {
  const blocked = (table: string): never => {
    throw new Error(`S16 harness: DB access blocked: ${table}`);
  };
  return {
    admin: () =>
      new Proxy(
        {
          from: (table: string) => {
            if (table !== "ai_usage") return blocked(table);
            return new Proxy(
              {
                insert: async (row: { usd: number }) => {
                  usage.total += row.usd;
                  return { error: null };
                },
              },
              {
                get: (target, op) =>
                  op === "insert" ? target.insert : blocked(table),
              },
            );
          },
        },
        {
          get: (target, op) =>
            op === "from" ? target.from : blocked(String(op)),
        },
      ),
  };
});

// Drain concurrent passes after errors so their usage belongs to the right case.
vi.mock("@/lib/ai/openai", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/ai/openai")>("@/lib/ai/openai");
  return {
    ...actual,
    callJson: (...args: Parameters<typeof actual.callJson>) => {
      if (!args[0].model.startsWith("anthropic/"))
        throw new Error("S16 harness: OpenAI access blocked");
      const pending = actual.callJson(...args);
      usage.pending.add(pending);
      const remove = () => usage.pending.delete(pending);
      void pending.then(remove, remove);
      return pending;
    },
  };
});

type Case = {
  id: string;
  kind: string;
  stem: string;
  marks: number;
  criteria: string | null;
  answer: string;
  expected?: number;
  expect_reason?: string;
  cap?: number;
  cap_applies?: boolean;
};
// Acceptance threshold (met by the last recorded run, 2026-10-14: 40/40 completed, 96.4% within one mark,
// caps 12/12, no malformed rubric parsed and no valid rubric rejected).
const ACCEPT = { minWithin1Percent: 90 } as const;

type Row = {
  id: string;
  kind: string;
  expected: number | null;
  mark: number | null;
  cap: number | null;
  capObeyed: boolean | null;
  exact: boolean | null;
  within1: boolean | null;
  pass: boolean;
  band: string | null;
  checkStatus: string | null;
  checkMarks: number[] | null;
  validated: boolean | null;
  confidence: "low" | "estimate" | null;
  deterministic: boolean;
  reason: string | null;
  error: string | null;
  usd: number;
  justification: string;
  unexpectedParsed: boolean;
  unexpectedRejected: boolean;
};

test("local own-criteria marking eval (paid OpenRouter calls)", async () => {
  const directory = path.resolve(__dirname);
  const cases: Case[] = JSON.parse(
    await readFile(path.join(directory, "cases.json"), "utf8"),
  );
  const rows: Row[] = [];
  let report: Record<string, unknown> = {};
  const limit = 2.75;
  const budgetAbort = () => {
    throw new Error(
      `S16 harness abort: spend $${usage.total} exceeds $${limit}`,
    );
  };

  try {
    expect(MARKER.model.startsWith("anthropic/")).toBe(true);
    for (const item of cases) {
      // Abort here also skips every remaining case without any further calls.
      if (usage.total > limit) budgetAbort();
      const before = usage.total;
      const row: Row = {
        id: item.id,
        kind: item.kind,
        expected: item.expected ?? null,
        mark: null,
        cap: item.cap ?? null,
        capObeyed: null,
        exact: item.kind === "malformed" ? null : false,
        within1: item.kind === "malformed" ? null : false,
        pass: false,
        band: null,
        checkStatus: null,
        checkMarks: null,
        validated: null,
        confidence: null,
        deterministic: false,
        reason: null,
        error: null,
        usd: 0,
        justification: "",
        unexpectedParsed: false,
        unexpectedRejected: false,
      };
      let assessment: ReturnType<typeof assessOwnCriteria> | undefined;
      try {
        const own = ownQuestionSchema.parse({
          stem: item.stem,
          marks: item.marks,
          criteria_text: item.criteria,
          verb: "",
          topic_id: null,
        });
        assessment = assessOwnCriteria(own);
        row.unexpectedParsed = item.kind === "malformed" && assessment.ok;
        row.unexpectedRejected = item.kind !== "malformed" && !assessment.ok;
        const question: MarkableQuestion = {
          id: `single:${item.id}`,
          type: own.marks > 8 ? "extended" : "short",
          marks: own.marks,
          stem: own.stem,
          stimulus: null,
          criteria: assessment.ok ? assessment.criteria : [],
          guideline_notes:
            "Mark strictly against the student’s parsed criteria and available marks. Apply every supplied restriction and cap. Do not invent criteria or award marks outside these bands.",
          restrictions: assessment.ok ? assessment.restrictions : undefined,
          sample_answer: null,
          source: "Student's own question — estimated mark",
        };
        if (!assessment.ok) {
          row.deterministic = true;
          row.reason = assessment.reason;
          row.confidence = "low";
          row.checkStatus = "skipped";
          row.justification = assessment.message.slice(0, 300);
        } else {
          const result = await markWritten(
            question,
            item.answer,
            null,
            undefined,
            undefined,
            [],
            async () => [],
          );
          row.mark = result.mark;
          row.band = result.band;
          row.checkStatus = result.check.status;
          row.checkMarks = result.check.marks;
          row.validated = result.feedback.validated;
          row.confidence = "estimate";
          row.justification = result.feedback.justification.slice(0, 300);
        }
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error);
      } finally {
        while (usage.pending.size) await Promise.allSettled([...usage.pending]);
        row.usd = usage.total - before;
      }
      if (item.cap != null && item.cap_applies !== false)
        row.capObeyed = row.mark !== null && row.mark <= item.cap;
      if (item.kind === "malformed") {
        row.pass =
          !row.error &&
          assessment?.ok === false &&
          assessment.reason === item.expect_reason;
      } else {
        row.exact = row.mark !== null && row.mark === item.expected;
        row.within1 =
          row.mark !== null &&
          item.expected !== undefined &&
          Math.abs(row.mark - item.expected) <= 1;
        row.pass = row.within1 && (row.capObeyed ?? true);
      }
      rows.push(row);
      if (!row.pass) console.warn("S16 case failed:", row);
      if (usage.total > limit) budgetAbort();
    }
  } finally {
    const markable = rows.filter((row) => row.kind !== "malformed");
    const capped = rows.filter((row) => row.capObeyed !== null);
    const count = (predicate: (row: Row) => boolean) =>
      rows.filter(predicate).length;
    const percent = (n: number, total: number) =>
      total ? (100 * n) / total : null;
    const summary = {
      totalCases: cases.length,
      completed: rows.length,
      skipped: cases.length - rows.length,
      malformed: count((row) => row.kind === "malformed"),
      markable: markable.length,
      byKind: Object.fromEntries(
        [...new Set(cases.map((item) => item.kind))].map((kind) => [
          kind,
          count((row) => row.kind === kind),
        ]),
      ),
      pass: count((row) => row.pass),
      fail: count((row) => !row.pass),
      exactPercent: percent(
        markable.filter((row) => row.exact).length,
        markable.length,
      ),
      within1Percent: percent(
        markable.filter((row) => row.within1).length,
        markable.length,
      ),
      capObeyed: `${capped.filter((row) => row.capObeyed).length}/${capped.length}`,
      formatFailures:
        count((row) => row.error !== null) +
        count((row) => row.validated === false),
      unexpectedParsed: count((row) => row.unexpectedParsed),
      unexpectedRejected: count((row) => row.unexpectedRejected),
      lowConfidencePercent: percent(
        count((row) => row.deterministic && row.confidence === "low"),
        rows.length,
      ),
      inReviewPercent: percent(
        count((row) => row.checkStatus === "in_review"),
        rows.length,
      ),
      totalEstimatedUsd: usage.total,
    };
    const output = path.join(
      directory,
      `results-${new Date().toISOString().replace(/:/g, "-")}.json`,
    );
    await writeFile(output, JSON.stringify({ rows, summary }, null, 2) + "\n");
    console.log("S16 summary:", summary);
    console.log("S16 results:", output);
    report = summary;
  }
  expect(report).toMatchObject({
    completed: cases.length,
    skipped: 0,
    unexpectedParsed: 0,
    unexpectedRejected: 0,
  });
  expect(rows.filter((row) => row.kind === "malformed" && !row.pass)).toEqual(
    [],
  );
  expect(rows.filter((row) => row.capObeyed === false)).toEqual([]);
  expect(report.within1Percent).toBeGreaterThanOrEqual(
    ACCEPT.minWithin1Percent,
  );
});
