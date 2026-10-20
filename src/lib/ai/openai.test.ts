// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { MODELS } from "./prices";

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  openaiCreate: vi.fn(),
  openrouterCreate: vi.fn(),
  serverEnv: vi.fn(),
  spend: vi.fn(),
  insert: vi.fn(),
  rpc: vi.fn(),
  release: vi.fn(),
  unlogged: vi.fn(),
}));

vi.mock("@/app/admin/marking/engine/store", () => ({
  unloggedSpend: mocks.unlogged,
}));

vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({
  default: class {
    chat;
    constructor(options: { baseURL?: string }) {
      mocks.constructor(options);
      this.chat = {
        completions: {
          create: options.baseURL ? mocks.openrouterCreate : mocks.openaiCreate,
        },
      };
    }
  },
}));
vi.mock("@/env/server", () => ({ serverEnv: mocks.serverEnv }));
vi.mock("./spend", async (original) => ({
  ...(await original<typeof import("./spend")>()),
  openRouterSpend: mocks.spend,
}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({
    rpc: mocks.rpc,
    from: () => ({
      insert: mocks.insert,
      delete: () => ({ eq: mocks.release }),
    }),
  }),
}));

const schema = z.object({ answer: z.string() });
const messages = [{ role: "user" as const, content: "Question" }];
const usage = { prompt_tokens: 1000, completion_tokens: 100 };
const response = {
  choices: [{ message: { content: JSON.stringify({ answer: "Answer" }) } }],
  usage,
};

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter");
  mocks.serverEnv.mockReturnValue({ OPENAI_API_KEY: "test-openai" });
  mocks.unlogged.mockResolvedValue(0);
  mocks.spend.mockResolvedValue(0);
  mocks.insert.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.release.mockResolvedValue({ error: null });
  mocks.openrouterCreate.mockResolvedValue(response);
  mocks.openaiCreate.mockResolvedValue({
    ...response,
    service_tier: "priority",
  });
});

afterEach(() => vi.unstubAllEnvs());

it("routes Anthropic through a lazy OpenRouter client without priority", async () => {
  const { callJson } = await import("./openai");
  expect(mocks.constructor).not.toHaveBeenCalled();
  const options = {
    task: "mark-written",
    model: MODELS.marker,
    schema,
    messages,
    effort: "medium" as const,
    fast: true,
    timeoutMs: 1234,
  };
  await expect(callJson(options)).resolves.toEqual({ answer: "Answer" });
  await callJson(options);
  expect(mocks.constructor).toHaveBeenCalledExactlyOnceWith({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "test-openrouter",
    maxRetries: 1,
    timeout: 90_000,
  });
  expect(mocks.openrouterCreate).toHaveBeenCalledWith(
    {
      model: MODELS.marker,
      messages,
      reasoning_effort: "medium",
      provider: { require_parameters: true },
      response_format: zodResponseFormat(schema, "mark_written"),
    },
    { timeout: 1234 },
  );
  expect(mocks.serverEnv).not.toHaveBeenCalled();
  expect(mocks.openaiCreate).not.toHaveBeenCalled();
  expect(mocks.insert).toHaveBeenCalledWith({
    attempt_id: null,
    user_id: null,
    task: "mark-written",
    model: MODELS.marker,
    input_tokens: 1000,
    cached_tokens: 0,
    output_tokens: 100,
    usd: 0.003,
  });
});

it("keeps the default OpenAI client and priority request shape for GPT", async () => {
  const { callJson } = await import("./openai");
  await callJson({
    task: "mark",
    model: MODELS.strong,
    schema,
    messages,
    fast: true,
  });
  expect(mocks.constructor).toHaveBeenCalledExactlyOnceWith({
    apiKey: "test-openai",
    maxRetries: 1,
    timeout: 90_000,
  });
  expect(mocks.openaiCreate).toHaveBeenCalledExactlyOnceWith(
    {
      model: MODELS.strong,
      messages,
      reasoning_effort: "low",
      service_tier: "priority",
      response_format: zodResponseFormat(schema, "mark"),
    },
    undefined,
  );
  expect(mocks.openrouterCreate).not.toHaveBeenCalled();
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({ usd: 0.006 }),
  );
});

it("logs usage before rejecting a reply that fails the schema", async () => {
  mocks.openrouterCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ wrong: 1 }) } }],
    usage,
  });
  const { callJson } = await import("./openai");
  await expect(
    callJson({ task: "mark", model: MODELS.marker, schema, messages }),
  ).rejects.toBeInstanceOf(ZodError);
  expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      task: "mark",
      model: MODELS.marker,
      input_tokens: 1000,
      output_tokens: 100,
    }),
  );
});

it.each([
  [
    "length",
    { finish_reason: "length", message: { content: '{"answer":"Ans' } },
    "length",
  ],
  [
    "content_filter",
    { finish_reason: "content_filter", message: { content: null } },
    "content_filter",
  ],
  [
    "refusal",
    {
      finish_reason: "stop",
      message: { refusal: "I cannot mark this", content: null },
    },
    "I cannot mark this",
  ],
  [
    "empty content",
    { finish_reason: "stop", message: { content: "" } },
    "stop",
  ],
])(
  "logs usage then rejects without structured output on %s",
  async (_case, choice, reason) => {
    mocks.openaiCreate.mockResolvedValue({ choices: [choice], usage });
    const { callJson } = await import("./openai");
    await expect(
      callJson({ task: "mark", model: MODELS.strong, schema, messages }),
    ).rejects.toThrow(`No structured output (${reason})`);
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        task: "mark",
        model: MODELS.strong,
        input_tokens: 1000,
        output_tokens: 100,
      }),
    );
  },
);

it("fails clearly when the OpenRouter key is missing", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", undefined);
  const { callJson } = await import("./openai");
  await expect(
    callJson({ task: "mark", model: MODELS.marker, schema, messages }),
  ).rejects.toThrow("OPENROUTER_API_KEY is not set");
  expect(mocks.constructor).not.toHaveBeenCalled();
  expect(mocks.openrouterCreate).not.toHaveBeenCalled();
});

it("logs web evaluation calls with task eval and reports their exact cost", async () => {
  const { callJson } = await import("./openai");
  const onUsage = vi.fn();
  await callJson({
    task: "eval",
    model: "gpt-6.1-sol",
    schema,
    messages,
    onUsage,
    fast: true,
  });
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({ task: "eval", usd: 0.006 }),
  );
  expect(onUsage).toHaveBeenCalledExactlyOnceWith(0.006);
});
it.each([80, null, NaN])(
  "refuses web eval before the mocked provider at spend %s",
  async (data) => {
    mocks.spend.mockResolvedValue(data);
    const { callJson } = await import("./openai");
    await expect(
      callJson({ task: "eval", model: "gpt-6.1-sol", schema, messages }),
    ).rejects.toThrow();
    expect(mocks.openaiCreate).not.toHaveBeenCalled();
  },
);
it("fails the web eval if logging fails, retaining its reported cost", async () => {
  mocks.insert.mockResolvedValue({
    error: { message: "Mock storage failure" },
  });
  const { callJson } = await import("./openai");
  const onUsage = vi.fn();
  await expect(
    callJson({ task: "eval", model: "gpt-6.1-sol", schema, messages, onUsage }),
  ).rejects.toThrow("Eval usage logging failed");
  expect(onUsage).toHaveBeenCalledExactlyOnceWith(0.006);
});

it("blocks eval on durable unlogged spend but preserves live logging failure behavior", async () => {
  mocks.spend.mockResolvedValue(79);
  mocks.unlogged.mockResolvedValue(1);
  const { callJson } = await import("./openai");
  await expect(
    callJson({ task: "eval", model: "gpt-6.1-sol", schema, messages }),
  ).rejects.toThrow("AI budget reached");
  expect(mocks.openaiCreate).not.toHaveBeenCalled();
  mocks.insert.mockResolvedValue({ error: { message: "logging failed" } });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(
    callJson({ task: "mark", model: "gpt-6.1-sol", schema, messages }),
  ).resolves.toEqual({ answer: "Answer" });
  expect(mocks.unlogged).toHaveBeenCalledTimes(1);
  log.mockRestore();
});
it.each([false, true])(
  "reports unlogged cost on insert failure (thrown: %s)",
  async (thrown) => {
    if (thrown) mocks.insert.mockRejectedValue(new Error("logging failed"));
    else
      mocks.insert.mockResolvedValue({ error: { message: "logging failed" } });
    const { callJson } = await import("./openai");
    const onUsage = vi.fn();
    const onUnloggedUsage = vi.fn();
    await expect(
      callJson({
        task: "eval",
        model: "gpt-6.1-sol",
        schema,
        messages,
        onUsage,
        onUnloggedUsage,
      }),
    ).rejects.toThrow();
    expect(onUsage).toHaveBeenCalledWith(0.006);
    expect(onUnloggedUsage).toHaveBeenCalledWith(0.006);
  },
);
it("bounds eval provider calls with no SDK retries and a step abort signal", async () => {
  const { callJson } = await import("./openai");
  const controller = new AbortController();
  await callJson({
    task: "eval",
    model: "gpt-6.1-sol",
    schema,
    messages,
    signal: controller.signal,
  });
  expect(mocks.openaiCreate).toHaveBeenCalledWith(expect.anything(), {
    timeout: 60_000,
    maxRetries: 0,
    signal: controller.signal,
  });
  controller.abort(new Error("deadline"));
  await expect(
    callJson({
      task: "eval",
      model: "gpt-6.1-sol",
      schema,
      messages,
      signal: controller.signal,
    }),
  ).rejects.toThrow("deadline");
  expect(mocks.openaiCreate).toHaveBeenCalledTimes(1);
});

it("times out a stalled eval usage insert and retains the unlogged cost", async () => {
  const { callJson } = await import("./openai");
  mocks.insert.mockReturnValue(new Promise(() => {}));
  const onUsage = vi.fn();
  const onUnloggedUsage = vi.fn();
  vi.useFakeTimers();
  try {
    const call = callJson({
      task: "eval",
      model: "gpt-6.1-sol",
      schema,
      messages,
      onUsage,
      onUnloggedUsage,
    });
    const rejected = expect(call).rejects.toThrow("Eval I/O deadline exceeded");
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(0.006);
    expect(onUnloggedUsage).toHaveBeenCalledExactlyOnceWith(0.006);
  } finally {
    vi.useRealTimers();
  }
});

it("logs the attempt context for individual marking costs", async () => {
  const { callJson } = await import("./openai");
  const { withAttemptUsage } = await import("./usage-context");
  mocks.openaiCreate.mockResolvedValue(response);
  await withAttemptUsage("synthetic-attempt", () =>
    callJson({ task: "mark_written", model: "gpt-6.1-sol", schema, messages }),
  );
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      attempt_id: "synthetic-attempt",
      task: "mark_written",
    }),
  );
});

it("routes the cheapest autofill model through OpenRouter and logs its cost", async () => {
  const { callJson } = await import("./openai");
  await callJson({
    task: "own-question-autofill",
    model: MODELS.ownQuestionAutofill,
    schema,
    messages,
    userId: "student",
  });
  expect(mocks.openrouterCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      model: "openai/gpt-6-luna",
      provider: { require_parameters: true },
    }),
    undefined,
  );
  expect(mocks.openaiCreate).not.toHaveBeenCalled();
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      task: "own-question-autofill",
      model: "openai/gpt-6-luna",
      input_tokens: 1000,
      output_tokens: 100,
      usd: 0.00015,
      user_id: "student",
    }),
  );
});

it("atomically replaces pending reservations with unchanged completed usage", async () => {
  const { callJson } = await import("./openai");
  const { withAiUsageReservation } = await import("./rate-limit");
  const { withAttemptUsage } = await import("./usage-context");
  await withAttemptUsage("attempt", () =>
    withAiUsageReservation({ ok: true, reservationId: "student-slot" }, () =>
      withAiUsageReservation({ ok: true, reservationId: "daily-slot" }, () =>
        callJson({
          task: "own-question-autofill",
          model: MODELS.ownQuestionAutofill,
          schema,
          messages,
          userId: "student",
        }),
      ),
    ),
  );
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
    "record_reserved_ai_usage",
    {
      p_reservations: ["student-slot", "daily-slot"],
      p_usage: {
        user_id: "student",
        attempt_id: "attempt",
        task: "own-question-autofill",
        model: MODELS.ownQuestionAutofill,
        input_tokens: 1000,
        cached_tokens: 0,
        output_tokens: 100,
        usd: expect.any(Number),
      },
    },
  );
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalledTimes(2);
});

it("still accounts for invalid paid output before releasing reservations", async () => {
  const { callJson } = await import("./openai");
  const { withAiUsageReservation } = await import("./rate-limit");
  mocks.openaiCreate.mockResolvedValue({
    ...response,
    choices: [{ message: { content: "{}" } }],
  });
  await expect(
    withAiUsageReservation({ ok: true, reservationId: "slot" }, () =>
      callJson({
        task: "mark_flashcard",
        model: MODELS.cheap,
        schema,
        messages,
        userId: "student",
      }),
    ),
  ).rejects.toBeInstanceOf(ZodError);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.release).toHaveBeenCalledTimes(1);
});

it.each([true, false])(
  "checks a deferred Finish allowance before the provider (allowed=%s)",
  async (allowed) => {
    const { callJson } = await import("./openai");
    const { aiUsageReservationIds, withDeferredAiUsageReservation } =
      await import("./rate-limit");
    const reserve = vi.fn(async () =>
      allowed
        ? { ok: true as const, reservationId: "finish-slot" }
        : { ok: false as const, error: "Slow down", retryAfterSec: 60 },
    );
    const validate = vi.fn(async () => {});
    mocks.openaiCreate.mockImplementationOnce(async () => {
      expect(aiUsageReservationIds()).toEqual(["finish-slot"]);
      expect(validate).toHaveBeenCalledTimes(1);
      return response;
    });
    const work = withDeferredAiUsageReservation(reserve, validate, async () => {
      expect(reserve).not.toHaveBeenCalled();
      return callJson({
        task: "session-summary",
        model: MODELS.cheap,
        schema,
        messages,
        userId: "student",
      });
    });
    if (allowed) {
      await expect(work).resolves.toEqual({ answer: "Answer" });
      expect(mocks.rpc).toHaveBeenCalledWith(
        "record_reserved_ai_usage",
        expect.objectContaining({ p_reservations: ["finish-slot"] }),
      );
      expect(mocks.release).toHaveBeenCalledWith("id", "finish-slot");
    } else {
      await expect(work).rejects.toThrow("Slow down");
      expect(mocks.openaiCreate).not.toHaveBeenCalled();
      expect(mocks.openrouterCreate).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
    expect(reserve).toHaveBeenCalledTimes(1);
  },
);
