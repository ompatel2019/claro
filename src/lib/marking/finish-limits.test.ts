// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({
    from: (table: string) => {
      const filters: unknown[] = [table];
      const query = {
        select: (...args: unknown[]) => {
          filters.push(args);
          return query;
        },
        eq: (...args: unknown[]) => {
          filters.push(args);
          return query;
        },
        neq: (...args: unknown[]) => {
          filters.push(args);
          return query;
        },
        gte: (...args: unknown[]) => {
          filters.push(args);
          return query;
        },
        order: (...args: unknown[]) => {
          filters.push(args);
          return query;
        },
        range: (...args: unknown[]) => {
          filters.push(args);
          return query;
        },
        throwOnError: () => mocks.query(filters),
      };
      return query;
    },
  }),
}));
import {
  dailyAiSprintCount,
  needsAiFinish,
  sessionNeedsAi,
} from "./finish-limits";

const written = {
  status: "pending",
  answer_text: "A usable written answer",
  transcript: null,
  feedback: null,
  questions: { type: "short" },
};
const mcq = { ...written, questions: { type: "mcq" } };

beforeEach(() => vi.clearAllMocks());

it.each([
  ["empty", [], false],
  ["MCQ-only", [mcq], false],
  ["mixed with only MCQs", [mcq, mcq], false],
  ["written", [written], true],
  ["mixed with written", [mcq, written], true],
  ["empty written", [{ ...written, answer_text: " " }], false],
  ["too short written", [{ ...written, answer_text: "two words" }], false],
  ["confirmed empty transcript", [{ ...written, transcript: "" }], false],
  [
    "usable transcript",
    [{ ...written, answer_text: null, transcript: "A usable transcript" }],
    true,
  ],
  [
    "marked writing still needs summary",
    [{ ...written, status: "marked", answer_text: "Answer" }],
    true,
  ],
  [
    "marked no answer",
    [{ ...written, status: "marked", feedback: { note: "No answer" } }],
    false,
  ],
] as const)("detects AI work for %s", (_name, attempts, expected) => {
  expect(needsAiFinish([...attempts])).toBe(expected);
});

it("inspects actual owned attempts using engine visibility", async () => {
  mocks.query.mockResolvedValue({ data: [mcq, written] });
  expect(await sessionNeedsAi("s", "u")).toBe(true);
  expect(mocks.query).toHaveBeenCalledWith(
    expect.arrayContaining(["attempts", ["session_id", "s"], ["user_id", "u"]]),
  );
});

it("counts only sessions with AI work, once per session, across pages", async () => {
  mocks.query
    .mockResolvedValueOnce({
      data: Array.from({ length: 200 }, () => ({
        attempts: [written, written],
      })),
    })
    .mockResolvedValueOnce({
      data: [
        { attempts: [mcq] },
        { attempts: [{ ...written, answer_text: "" }] },
        { attempts: [mcq, written] },
        {
          attempts: [
            { ...written, status: "marked", feedback: { note: "No answer" } },
          ],
        },
      ],
    });
  expect(await dailyAiSprintCount("u", "midnight")).toBe(201);
  expect(mocks.query).toHaveBeenNthCalledWith(
    1,
    expect.arrayContaining([
      "sessions",
      ["user_id", "u"],
      ["kind", "sprint"],
      ["finished_at", "midnight"],
      [0, 199],
    ]),
  );
  expect(mocks.query).toHaveBeenNthCalledWith(
    2,
    expect.arrayContaining([[200, 399]]),
  );
});

it("propagates lookup failures before paid work", async () => {
  mocks.query.mockRejectedValue(new Error("Database unavailable"));
  await expect(sessionNeedsAi("s", "u")).rejects.toThrow(
    "Database unavailable",
  );
  await expect(dailyAiSprintCount("u", "midnight")).rejects.toThrow(
    "Database unavailable",
  );
});
