// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./ai/openai", () => ({ callJson: vi.fn() }));
vi.mock("./ai/rate-limit", async (original) => ({
  ...(await original<typeof import("./ai/rate-limit")>()),
  assertStudentAiRateLimit: vi.fn(),
}));
vi.mock("@/utils/supabase/admin", () => ({ admin: vi.fn() }));
import { zodResponseFormat } from "openai/helpers/zod";
import { callJson } from "./ai/openai";
import {
  aiUsageReservationIds,
  assertStudentAiRateLimit,
  withAiUsageReservation,
} from "./ai/rate-limit";
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

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ENABLE_OWN_QUESTION_MARKING", "true");
  vi.stubEnv("ENABLE_OWN_QUESTION_AUTOFILL", "true");
  vi.mocked(assertStudentAiRateLimit).mockResolvedValue({ ok: true });
  const query = {
    select: vi.fn(),
    not: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [{ id: "policy", name: "Monetary policy" }],
        error: null,
      }).then(resolve),
  };
  for (const key of ["select", "not"] as const)
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
  vi.mocked(assertStudentAiRateLimit).mockImplementation(async ({ scope }) =>
    scope === "autofill"
      ? {
          ok: false,
          error:
            "You've used today's 10 autofill calls. Paste your own guidelines or try tomorrow.",
          retryAfterSec: 86400,
        }
      : { ok: true },
  );
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

it("reserves daily capacity for each invalid-output retry", async () => {
  vi.mocked(callJson).mockResolvedValueOnce({ ...output, criteria_text: null });
  await generateOwnQuestion("u", input);
  expect(
    vi.mocked(assertStudentAiRateLimit).mock.calls.map(([opts]) => opts.scope),
  ).toEqual([undefined, "autofill", "autofill"]);
});
it("does not call the provider again when a retry has no daily capacity", async () => {
  vi.mocked(callJson).mockResolvedValueOnce({ ...output, criteria_text: null });
  vi.mocked(assertStudentAiRateLimit)
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({
      ok: false,
      error: "You've used today's 10 autofill calls.",
      retryAfterSec: 86400,
    });
  await expect(generateOwnQuestion("u", input)).rejects.toThrow("today's 10");
  expect(callJson).toHaveBeenCalledTimes(1);
});

it.each([60, 3600])(
  "reuses the enclosing marking slot at the final student allowance (retry %i)",
  async (retryAfterSec) => {
    const release = vi.fn().mockResolvedValue({ error: null });
    const topics = {
      select: () => ({
        not: async () => ({
          data: [{ id: "policy", name: "Monetary policy" }],
        }),
      }),
    };
    vi.mocked(admin).mockReturnValue({
      from: (table: string) =>
        table === "topics" ? topics : { delete: () => ({ eq: release }) },
    } as never);
    // The mark route already reserved the 20th minute / 200th hourly slot.
    vi.mocked(assertStudentAiRateLimit).mockImplementation(async ({ scope }) =>
      scope === "autofill"
        ? { ok: true, reservationId: "daily-slot" }
        : { ok: false, error: "Slow down", retryAfterSec },
    );
    vi.mocked(callJson).mockImplementationOnce(async () => {
      expect(aiUsageReservationIds()).toEqual(["mark-slot", "daily-slot"]);
      return output;
    });
    await expect(
      withAiUsageReservation({ ok: true, reservationId: "mark-slot" }, () =>
        generateOwnQuestion("u", input),
      ),
    ).resolves.toEqual({ ...output, stem: input.stem });
    expect(assertStudentAiRateLimit).toHaveBeenCalledExactlyOnceWith({
      userId: "u",
      scope: "autofill",
    });
    expect(callJson).toHaveBeenCalledTimes(1);
    expect(release.mock.calls).toEqual([
      ["id", "daily-slot"],
      ["id", "mark-slot"],
    ]);
  },
);
