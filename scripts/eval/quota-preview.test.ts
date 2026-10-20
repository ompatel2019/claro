// @vitest-environment node
import { expect, it, vi } from "vitest";
import { previewQuotaExamples, quotaPreviewCli } from "./quota-preview.mjs";

vi.mock("@/utils/supabase/admin", () => {
  throw new Error("Unexpected database import");
});
vi.mock("@/lib/ai/openai", () => {
  throw new Error("Unexpected model import");
});

const input = {
  question: {
    marks: 4,
    criteria: [1, 2, 3, 4].map((mark) => ({
      min: mark,
      max: mark,
      descriptor: `Band ${mark}`,
    })),
  },
  answer: "Demand raises prices",
  firstMark: 2,
  pool: [
    {
      tutor_mark: 2,
      answer_text: "Demand raises prices",
      accepted_tutor_comments: [{ body: "Clear mechanism" }],
    },
    { tutor_mark: 1, answer_text: "Demand raises prices" },
    { tutor_mark: 3, answer_text: "Demand raises prices" },
    ...Array.from({ length: 7 }, (_, i) => ({
      tutor_mark: 4,
      answer_text: `Unrelated ${i}`,
    })),
  ],
};

it("prints the exact first-mark and adjacent quotas, fills six, and retains rationales", () => {
  const read = vi.fn().mockReturnValue(JSON.stringify(input));
  const write = vi.fn();
  quotaPreviewCli(["--file=local.json"], read, write);
  expect(read).toHaveBeenCalledExactlyOnceWith("local.json");
  expect(JSON.parse(write.mock.calls[0][0])).toEqual(input.pool.slice(0, 6));
});

it("uses the supplied first mark and keeps band anchors for a sparse pool", () => {
  expect(
    previewQuotaExamples({ ...input, firstMark: 4 })
      .slice(0, 3)
      .map((e) => e.tutor_mark),
  ).toEqual([4, 2, 3]);
  expect(
    previewQuotaExamples({ ...input, pool: input.pool.slice(0, 3) }).map(
      (e) => e.tutor_mark,
    ),
  ).toEqual([3, 2, 1]);
});

it.each([-1, 2.5, 5])("rejects invalid first marks %s", (firstMark) => {
  expect(() => previewQuotaExamples({ ...input, firstMark })).toThrow();
});

it.each([[], ["--file="], ["--live"], ["--file=a", "--file=b"]])(
  "rejects invalid arguments %j before reading",
  (...args) => {
    const read = vi.fn();
    expect(() => quotaPreviewCli(args, read)).toThrow("Usage:");
    expect(read).not.toHaveBeenCalled();
  },
);
