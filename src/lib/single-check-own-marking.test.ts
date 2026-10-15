// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./single-check-autofill", () => ({ generateOwnQuestion: vi.fn() }));
vi.mock("@/lib/ai/openai", () => ({ callJson: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ admin: vi.fn() }));
import { generateOwnQuestion } from "./single-check-autofill";
import { callJson } from "@/lib/ai/openai";
import { admin } from "@/utils/supabase/admin";
import { markOwnCheck } from "./single-check-marking";

function chain(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    or: vi.fn(),
    update: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ data }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };
  for (const key of ["select", "eq", "single", "or", "update"] as const)
    query[key].mockReturnValue(query);
  return query;
}
const question = {
  stem: "Explain the causes of inflation.",
  marks: 4,
  verb: "explain",
  topic_id: null,
  criteria_text:
    "3–4 marks: Explains causes and their effects.\n1–2: Identifies relevant causes of inflation.",
};
function setup() {
  const save = chain({ status: "marked" });
  const queries = [
    chain({ status: "pending", answer_text: "Prices rise as demand grows" }),
    chain([{ id: "a" }]),
    save,
  ];
  const from = vi.fn((table: string) => {
    // Any unexpected example retrieval fails rather than reaching a real database.
    expect(table).toBe("attempts");
    const query = queries.shift();
    if (!query) throw new Error("Unexpected database read");
    return query;
  });
  vi.mocked(admin).mockReturnValue({ from } as never);
  return { save, from };
}
beforeEach(() => vi.resetAllMocks());
it.each([
  { criteria_text: null, reason: "missing" },
  { criteria_text: "A good answer", reason: "vague" },
  {
    criteria_text: "1–3: Explains causes and their effects.",
    reason: "inconsistent",
  },
])(
  "saves low-confidence $reason criteria without calling the model",
  async ({ criteria_text, reason }) => {
    const { save, from } = setup();
    await markOwnCheck("a", "u", { question: { ...question, criteria_text } });
    expect(callJson).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(3);
    expect(save.update).toHaveBeenCalledWith(
      expect.objectContaining({
        mark: null,
        band: null,
        max_marks: 4,
        status: "marked",
        check_status: "skipped",
        marked_by_model: "deterministic",
        feedback: {
          confidence: "low",
          unreliable_reason: reason,
          note: expect.stringContaining("We can't mark this reliably:"),
        },
      }),
    );
  },
);
it("marks valid criteria strictly with no example database read", async () => {
  const { save, from } = setup();
  vi.mocked(callJson).mockResolvedValue({
    mark: 4,
    elements_identified: "Demand and prices",
    band_selected: "Explains causes and their effects.",
    analysis: { strengths: [], imprecise: [], missing: [] },
    bands_considered: [
      {
        band: "Explains causes and their effects.",
        satisfied: true,
        evidence: "Prices rise",
      },
    ],
    justification: "Explains the effect of demand.",
    why_not_higher: "",
    comments: [
      {
        quote: "Prices rise",
        kind: "strength",
        tag: "Analysis",
        body: "Explains the effect.",
        next_mark: null,
      },
      {
        quote: "demand grows",
        kind: "strength",
        tag: "Knowledge",
        body: "Identifies demand.",
        next_mark: null,
      },
    ],
    earned: [],
    missing_points: [],
    next_band: "",
    better_answer_outline: ["Cause", "Mechanism", "Effect"],
  });
  await markOwnCheck("a", "u", {
    question: {
      ...question,
      criteria_text:
        question.criteria_text + "\nWithout both mechanisms, cap at 2",
    },
  });
  expect(callJson).toHaveBeenCalledTimes(2);
  for (const [call] of vi.mocked(callJson).mock.calls) {
    const prompt = call.messages.map((message) => message.content).join("\n");
    expect(prompt).toContain("Without both mechanisms, cap at 2");
    expect(prompt).toContain("3-4: Explains causes and their effects.");
    expect(prompt).toContain("1-2: Identifies relevant causes of inflation.");
    expect(prompt).toContain(
      "Mark strictly against the student’s parsed criteria",
    );
  }
  expect(from).toHaveBeenCalledTimes(3);
  expect(save.update).toHaveBeenCalledWith(
    expect.objectContaining({
      mark: 4,
      feedback: expect.objectContaining({ confidence: "estimate" }),
    }),
  );
});

afterEach(() => vi.unstubAllEnvs());
it("generates empty guidelines before marking when enabled", async () => {
  vi.stubEnv("ENABLE_OWN_QUESTION_AUTOFILL", "true");
  setup();
  vi.mocked(generateOwnQuestion).mockResolvedValue({
    ...question,
    topic_id: "policy",
  });
  // The marking model is deliberately stopped after rubric generation.
  vi.mocked(callJson).mockRejectedValue(new Error("mock marker stopped"));
  await expect(
    markOwnCheck("a", "u", { question: { ...question, criteria_text: null } }),
  ).rejects.toThrow();
  expect(generateOwnQuestion).toHaveBeenCalledExactlyOnceWith("u", {
    stem: question.stem,
    marks: 4,
  });
  expect(callJson).toHaveBeenCalled();
});
it("keeps generation failures retryable rather than storing an unmarkable card", async () => {
  vi.stubEnv("ENABLE_OWN_QUESTION_AUTOFILL", "true");
  const { save } = setup();
  vi.mocked(generateOwnQuestion).mockRejectedValue(
    new Error("Please retry guidelines"),
  );
  await expect(
    markOwnCheck("a", "u", { question: { ...question, criteria_text: null } }),
  ).rejects.toThrow("Please retry guidelines");
  expect(save.update).toHaveBeenCalledWith({ status: "failed" });
  expect(callJson).not.toHaveBeenCalled();
});
it("does not replace supplied guidelines", async () => {
  vi.stubEnv("ENABLE_OWN_QUESTION_AUTOFILL", "true");
  setup();
  await markOwnCheck("a", "u", {
    question: { ...question, criteria_text: "Vague" },
  });
  expect(generateOwnQuestion).not.toHaveBeenCalled();
});

it("does not generate again for an already marked attempt", async () => {
  vi.stubEnv("ENABLE_OWN_QUESTION_AUTOFILL", "true");
  vi.mocked(admin).mockReturnValue({
    from: () => chain({ status: "marked", mark: 4 }),
  } as never);
  await expect(
    markOwnCheck("a", "u", { question: { ...question, criteria_text: null } }),
  ).resolves.toEqual({ status: "marked", mark: 4 });
  expect(generateOwnQuestion).not.toHaveBeenCalled();
});
