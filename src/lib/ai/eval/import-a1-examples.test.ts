// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import questions from "./a1-mock-questions.json";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  admin: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("node:fs", () => ({ readFileSync: mocks.read }));
vi.mock("@/utils/supabase/admin", () => ({ admin: mocks.admin }));
const argv = process.argv;
const snapshot = [
  {
    question: questions[0].id,
    source_hash: "0123456789abcdef0123456789abcdef",
    answer_text: "An anonymised human-marked script.",
    tutor_mark: 1,
    accepted_tutor_comments: [],
    rejected_ai_comments: [],
  },
];
const run = () => import("./import-a1-examples.mts" as string);

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  process.argv = [
    "node",
    "import-a1-examples.mts",
    "snapshot.json",
    "--dry-run",
  ];
  mocks.read.mockReturnValue(JSON.stringify(snapshot));
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit ${code}`);
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.argv = argv;
  vi.restoreAllMocks();
});

it("validates and reports an export in dry-run with no database access", async () => {
  await expect(run()).rejects.toThrow("exit 0");
  expect(console.log).toHaveBeenCalledWith(
    "1 answers over 1 questions: 0 test, 1 example.",
  );
  expect(mocks.admin).not.toHaveBeenCalled();
});

it("rejects bad exports before constructing a database client even for a live import", async () => {
  process.argv.pop();
  mocks.read.mockReturnValue(
    JSON.stringify([{ ...snapshot[0], tutor_mark: 100 }]),
  );
  await expect(run()).rejects.toThrow("exceeds maximum");
  expect(mocks.admin).not.toHaveBeenCalled();
});

it.each([{ args: [] }, { args: ["snapshot.json", "--unknown"] }])(
  "rejects invalid command arguments %j before reads",
  async ({ args }) => {
    process.argv = ["node", "import-a1-examples.mts", ...args];
    await expect(run()).rejects.toThrow("Usage:");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  },
);

it("only writes validated rows to Claro with duplicate-safe upserts", async () => {
  process.argv.pop();
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(() => query),
    upsert: mocks.upsert,
    throwOnError: vi
      .fn()
      .mockResolvedValue({ data: [{ id: `a1-${questions[0].id}` }], count: 1 }),
  };
  mocks.upsert.mockReturnValue(query);
  const from = vi.fn((table: string) => {
    expect(["questions", "marking_examples"]).toContain(table);
    return query;
  });
  mocks.admin.mockReturnValue({ from });
  await run();
  expect(from.mock.calls.map((call) => call[0])).toEqual([
    "questions",
    "marking_examples",
    "marking_examples",
  ]);
  expect(mocks.upsert).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        origin: "a1",
        split: "example",
        question_id: `a1-${questions[0].id}`,
      }),
    ],
    { onConflict: "source_hash", ignoreDuplicates: true },
  );
});

it("stops before upsert if Claro is missing a mock question", async () => {
  process.argv.pop();
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    throwOnError: vi.fn().mockResolvedValue({ data: [] }),
  };
  mocks.admin.mockReturnValue({ from: () => query });
  await expect(run()).rejects.toThrow("exit 1");
  expect(mocks.upsert).not.toHaveBeenCalled();
});
