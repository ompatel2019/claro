// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { MarkableQuestion } from "@/lib/marking/grade";

vi.mock("./examples", () => ({ evalExamplePool: vi.fn() }));
vi.mock("@/lib/marking/engine", () => ({ markWritten: vi.fn() }));
import { markWritten } from "@/lib/marking/engine";
import { emptyRow, markEvalItem } from "./item";

const q: MarkableQuestion = {
  id: "synthetic-question",
  type: "short",
  marks: 4,
  stem: "Explain demand.",
  stimulus: null,
  criteria: [{ min: 1, max: 4, descriptor: "Relevant" }],
  guideline_notes: null,
  sample_answer: null,
  source: "Synthetic",
};
beforeEach(() => vi.resetAllMocks());

it.each([
  [[3, 3], false],
  [[3, 2, 3], true],
  [[3], undefined],
])("records uncertainty for initial marks %j", async (marks, uncertain) => {
  vi.mocked(markWritten).mockResolvedValue({
    mark: 3,
    band: "Relevant",
    check: { status: "agreed", marks },
    feedback: {
      validated: true,
      comments: [],
      justification: "Evidence",
      next_band: "More detail",
      why_not_higher: "Missing link",
      better_answer_outline: [],
    },
  } as never);
  const row = emptyRow({
    id: "synthetic-item",
    section: "Dev",
    label: "",
    expected: 3,
    q,
  });
  await markEvalItem(row, q, "Demand rises", "eval", async () => 0);
  expect(row.flags.uncertain).toBe(uncertain);
  expect(row.check?.marks).toEqual(marks);
  expect(row.score?.exact).toBe(true);
  expect(row.usd).toBe(0);
  expect(row.feedback).not.toContain("uncertain");
});
