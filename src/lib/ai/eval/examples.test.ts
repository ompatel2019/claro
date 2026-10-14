// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { MarkableQuestion } from "@/lib/marking/grade";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/openai", () => ({ callJson: vi.fn() }));
const mocks = vi.hoisted(() => ({ load: vi.fn(), from: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ from: mocks.from }),
}));
import { callJson } from "@/lib/ai/openai";
import { emptyRow, markEvalItem } from "./item";
import { evalExamplePool } from "./examples";
import { evalSets } from "./sets";

const q: MarkableQuestion = {
  id: "fixture-question",
  type: "short",
  marks: 4,
  stem: "Explain demand.",
  stimulus: null,
  criteria: [1, 2, 3, 4].map((mark) => ({
    min: mark,
    max: mark,
    descriptor: `Band ${mark}`,
  })),
  guideline_notes: null,
  sample_answer: null,
  source: "Synthetic",
};
const example = (id: string, answer_text: string, tutor_mark = 4) => ({
  id,
  question_id: q.id,
  split: "example",
  answer_text,
  tutor_mark,
  source_hash: `hash:${id}`,
});
const grade = (mark: number) => ({
  mark,
  band_selected: `Band ${mark}`,
  justification: "Synthetic evidence",
  comments: [
    {
      kind: "strength",
      quote: "Demand",
      body: "Clear",
      tag: "Analysis",
      next_mark: null,
    },
    {
      kind: "fix",
      quote: "Demand",
      body: "Explain more",
      tag: "Analysis",
      next_mark: "Add detail",
    },
  ],
  next_band: "Add detail",
  why_not_higher: "Needs detail",
  better_answer_outline: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    throwOnError: mocks.load,
  };
  mocks.from.mockReturnValue(query);
});

it.each([undefined, "dev", "final"] as const)(
  "keeps forbidden examples out of every pass in mode %s, for quotas and sparse band pools",
  async (set) => {
    for (const size of [12, 3]) {
      vi.mocked(callJson).mockClear();
      const id = set ? evalSets[set][0] : "default-self";
      const answer = {
        id,
        answer_text: "Demand rises",
        source_hash: "self-hash",
      };
      const eligible = Array.from({ length: size }, (_, i) =>
        example(`safe-${i}`, `Eligible answer ${i}`, i % 5),
      );
      const forbidden = [
        ...[...evalSets.dev, ...evalSets.final].map((id) =>
          example(id, `Frozen answer ${id}`),
        ),
        example(id, "Identity duplicate with different text"),
        {
          ...example(evalSets.dev[1], "Another frozen dev answer"),
          split: "test",
        },
        example("dev-text-copy", "  ANOTHER\n FROZEN dev answer "),
        example(
          "final-text-copy",
          ` FROZEN\t ANSWER ${evalSets.final[1].toUpperCase()} `,
        ),
        example("text-copy", "  ＤＥＭＡＮＤ\nRISES  "),
        {
          ...example("hash-copy", "Hash duplicate with different text"),
          source_hash: answer.source_hash,
        },
        { ...example("test-row", "Held-out test answer"), split: "test" },
      ];
      mocks.load.mockResolvedValue({ data: [...forbidden, ...eligible] });
      expect(await evalExamplePool(q, answer)).toEqual(eligible);
      vi.mocked(callJson)
        .mockResolvedValueOnce(grade(4) as never)
        .mockResolvedValueOnce(grade(2) as never)
        .mockResolvedValueOnce(grade(4) as never);
      const row = emptyRow({
        id: q.id,
        exampleId: id,
        section: set === "dev" ? "Dev" : set === "final" ? "Final" : "Held-out",
        label: "",
        expected: 4,
        q,
      });
      await markEvalItem(
        row,
        q,
        answer.answer_text,
        "eval:fixture",
        async () => 0,
        undefined,
        [],
        answer.source_hash,
      );
      expect(callJson).toHaveBeenCalledTimes(3);
      for (const [call] of vi.mocked(callJson).mock.calls) {
        const anchors = call.messages.flatMap((message) =>
          [
            ...(typeof message.content === "string"
              ? message.content
              : ""
            ).matchAll(
              /<marked_answer tutor_mark="\d+">\n([\s\S]*?)\n<\/marked_answer>/g,
            ),
          ].map((match) => match[1]),
        );
        expect(anchors.length).toBeGreaterThan(0);
        for (const text of anchors)
          expect(eligible.map((row) => row.answer_text)).toContain(text);
      }
    }
  },
);
