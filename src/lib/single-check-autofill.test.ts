// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./ai/openai", () => ({ callJson: vi.fn() }));
vi.mock("./ai/rate-limit", () => ({ assertStudentAiRateLimit: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ admin: vi.fn() }));
import { zodResponseFormat } from "openai/helpers/zod";
import { callJson } from "./ai/openai";
import { assertStudentAiRateLimit } from "./ai/rate-limit";
import { admin } from "@/utils/supabase/admin";
import { generateOwnQuestion } from "./single-check-autofill";
const input = { stem: "Explain monetary policy.", marks: 4 };
const output = {
  marks: 4,
  verb: "explain",
  topic_id: "policy",
  criteria_text:
    "1-2: Identifies relevant monetary policy tools.\n3-4: Explains policy mechanisms and economic effects.",
};
let count = 0;
beforeEach(() => {
  vi.resetAllMocks();
  count = 0;
  vi.stubEnv("ENABLE_OWN_QUESTION_MARKING", "true");
  vi.stubEnv("ENABLE_OWN_QUESTION_AUTOFILL", "true");
  vi.mocked(assertStudentAiRateLimit).mockResolvedValue({ ok: true });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    not: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        count,
        data: [{ id: "policy", name: "Monetary policy" }],
        error: null,
      }).then(resolve),
  };
  for (const key of ["select", "eq", "gte", "not"] as const)
    query[key].mockReturnValue(query);
  vi.mocked(admin).mockReturnValue({ from: () => query } as never);
  vi.mocked(callJson).mockResolvedValue(output);
});
afterEach(() => vi.unstubAllEnvs());
it("uses the cheapest configured OpenRouter model and logs under a separate task", async () => {
  await expect(generateOwnQuestion("u", input)).resolves.toEqual({
    ...output,
    stem: input.stem,
  });
  expect(callJson).toHaveBeenCalledWith(
    expect.objectContaining({
      model: "openai/gpt-6-luna",
      userId: "u",
      task: "own-question-autofill",
    }),
  );
});
it.each([
  { topic_id: "invented" },
  { marks: 5 },
  { criteria_text: "A good answer" },
  { criteria_text: "1-3: Identifies relevant economic policy tools." },
  { criteria_text: "1-4: Too short" },
])("retries invalid output once: %j", async (patch) => {
  vi.mocked(callJson).mockResolvedValueOnce({ ...output, ...patch });
  await expect(generateOwnQuestion("u", input)).resolves.toEqual({
    ...output,
    stem: input.stem,
  });
  expect(callJson).toHaveBeenCalledTimes(2);
});
it("rejects two invalid outputs with a retryable message", async () => {
  vi.mocked(callJson).mockResolvedValue({ ...output, criteria_text: null });
  await expect(generateOwnQuestion("u", input)).rejects.toThrow(
    "Please try again",
  );
  expect(callJson).toHaveBeenCalledTimes(2);
});
it.each(["false", "TRUE", ""])("refuses disabled flag %s", async (flag) => {
  vi.stubEnv("ENABLE_OWN_QUESTION_AUTOFILL", flag);
  await expect(generateOwnQuestion("u", input)).rejects.toThrow("unavailable");
  expect(callJson).not.toHaveBeenCalled();
});
it("enforces the daily cap before model invocation", async () => {
  count = 10;
  await expect(generateOwnQuestion("u", input)).rejects.toThrow("today's 10");
  expect(callJson).not.toHaveBeenCalled();
});
it("enforces student rate limits", async () => {
  vi.mocked(assertStudentAiRateLimit).mockResolvedValue({
    ok: false,
    error: "Slow down",
    retryAfterSec: 60,
  });
  await expect(generateOwnQuestion("u", input)).rejects.toThrow("Slow down");
  expect(callJson).not.toHaveBeenCalled();
});
it("does not retry a spend-cap refusal", async () => {
  vi.mocked(callJson).mockRejectedValue(new Error("AI budget reached"));
  await expect(generateOwnQuestion("u", input)).rejects.toThrow(
    "AI budget reached",
  );
  expect(callJson).toHaveBeenCalledTimes(1);
});

it("supplies a schema supported by strict JSON output", async () => {
  await generateOwnQuestion("u", input);
  const schema = vi.mocked(callJson).mock.calls[0][0].schema;
  expect(() => zodResponseFormat(schema, "autofill")).not.toThrow();
});
