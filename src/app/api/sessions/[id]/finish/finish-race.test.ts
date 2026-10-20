// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  provider: vi.fn(),
  snapshot: vi.fn(),
  load: vi.fn(),
  release: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/admin", () => ({
  admin: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "student" } } }) },
    from: mocks.from,
  }),
}));
vi.mock("@/env/server", () => ({
  serverEnv: () => ({ OPENAI_API_KEY: "test-only" }),
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mocks.provider } };
  },
}));

// Keep the route, Finish engine, limit decisions and provider guard real.
import { POST } from "./route";
import {
  aiUsageReservationIds,
  AI_RATE_LIMIT_MESSAGE,
} from "@/lib/ai/rate-limit";
import { needsAiFinish } from "@/lib/marking/finish-limits";
import { CheckSchema, GradeSchema } from "@/lib/marking/schemas";
import type { MarkableQuestion } from "@/lib/marking/grade";

const question: MarkableQuestion = {
  id: "question",
  type: "short",
  marks: 4,
  stem: "Explain two effects.",
  stimulus: null,
  criteria: [
    { min: 3, max: 4, descriptor: "Explains two effects" },
    { min: 1, max: 2, descriptor: "Identifies one effect" },
  ],
  guideline_notes: null,
  sample_answer: null,
  source: "synthetic",
};
const grade = {
  analysis: { strengths: ["Effect explained"], imprecise: [], missing: [] },
  elements_identified: "Two effects",
  bands_considered: [],
  band_selected: "Explains two effects",
  justification: "Explains both effects",
  why_not_higher: "",
  mark: 4,
  comments: [
    {
      quote: "Prices rise",
      kind: "strength",
      tag: "Analysis",
      body: "Clear effect",
      next_mark: null,
    },
    {
      quote: "demand falls",
      kind: "strength",
      tag: "Analysis",
      body: "Second effect",
      next_mark: null,
    },
  ],
  earned: ["Two effects"],
  missing_points: [],
  next_band: "",
  better_answer_outline: ["Cause", "Prices", "Demand"],
};
const summary = {
  strengths: ["Explained effects"],
  improvements: [],
  next_steps: ["Try another sprint"],
};
const attempt = (id: string, sessionId: string) => ({
  id,
  session_id: sessionId,
  user_id: "student",
  position: 1,
  status: "pending",
  answer_text: "",
  transcript: null,
  answer_version: 0,
  claimed_at: null as string | null,
  marked_at: null as string | null,
  mark: null as number | null,
  max_marks: 4,
  feedback: null,
  question,
});
type Attempt = ReturnType<typeof attempt>;
const sessions = new Map<
  string,
  { id: string; user_id: string; kind: string; finished_at: string | null }
>();
let attempts: Attempt[];
let allowance: "allowed" | "minute" | "hour" | "daily";
let dailyChecked: boolean;
let summaryOnly: boolean;
let retryFinish: boolean;
let finalSlot: boolean;
let reservations: Set<string>;
let settled: Set<string>;
let events: string[];

function result(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, { throwOnError: () => promise });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENROUTER_API_KEY", "test-only");
  sessions.clear();
  sessions.set("sprint", {
    id: "sprint",
    user_id: "student",
    kind: "sprint",
    finished_at: null,
  });
  attempts = [attempt("a", "sprint"), attempt("b", "sprint")];
  allowance = "allowed";
  dailyChecked = false;
  summaryOnly = false;
  retryFinish = false;
  finalSlot = false;
  reservations = new Set();
  settled = new Set();
  events = [];

  mocks.snapshot.mockImplementation((rows: Attempt[]) => {
    const snapshot = rows.map((a) => ({
      ...structuredClone(a),
      questions: { type: a.question.type },
    }));
    // This is the real sessionNeedsAi query, not a stubbed boolean result.
    expect(needsAiFinish(snapshot)).toBe(false);
    events.push("blank snapshot");
    return snapshot;
  });
  mocks.load.mockImplementation((sessionId: string) => {
    const rows = attempts.filter((a) => a.session_id === sessionId);
    if (rows.every((a) => !a.answer_text)) {
      expect(mocks.snapshot).toHaveBeenCalled();
      expect(events).not.toContain("reserve");
      // Deterministic concurrent save, after the check and before engine reload.
      for (const a of rows) {
        a.answer_text = "Prices rise and demand falls";
        a.answer_version++;
        if (summaryOnly) {
          a.status = "marked";
          a.mark = 4;
        }
      }
      events.push("answer saved");
    }
    return structuredClone(rows);
  });
  mocks.release.mockImplementation((id: string) => {
    reservations.delete(id);
  });
  mocks.from.mockImplementation((table: string) => {
    let columns = "";
    let single = false;
    let patch: Record<string, unknown> | undefined;
    let deleting = false;
    const filters: Record<string, unknown> = {};
    const execute = () => {
      if (table === "profiles") return result({ role: "student" });
      if (table === "ai_usage_reservations" && deleting) {
        mocks.release(filters.id);
        return result(null);
      }
      if (table === "marking_examples_for_grader") return result([]);
      if (table === "sessions") {
        if (columns.startsWith("id,attempts!inner")) {
          events.push("daily check");
          dailyChecked = true;
          return result(
            allowance === "daily"
              ? Array.from({ length: 200 }, () => ({
                  attempts: [
                    {
                      status: "marked",
                      answer_text: "A completed written answer",
                      transcript: null,
                      feedback: null,
                      questions: { type: "short" },
                    },
                  ],
                }))
              : [],
          );
        }
        return result(structuredClone(sessions.get(String(filters.id))));
      }
      if (table !== "attempts") throw new Error(`Unexpected table ${table}`);
      const rows = attempts.filter((a) =>
        Object.entries(filters).every(
          ([key, value]) => a[key as keyof Attempt] === value,
        ),
      );
      if (patch) {
        rows.forEach((a) => Object.assign(a, patch));
        return result(structuredClone(single ? rows[0] : rows));
      }
      if (columns.includes("questions!inner"))
        return result(mocks.snapshot(rows));
      if (single) return result(structuredClone(rows[0]));
      return Promise.resolve(mocks.load(String(filters.session_id))).then(
        result,
      );
    };
    const query = {
      select(value: string) {
        columns = value;
        return this;
      },
      eq(key: string, value: unknown) {
        filters[key] = value;
        return this;
      },
      is(key: string, value: unknown) {
        return this.eq(key, value);
      },
      update(value: Record<string, unknown>) {
        patch = value;
        return this;
      },
      delete() {
        deleting = true;
        return this;
      },
      single() {
        single = true;
        return this;
      },
      maybeSingle() {
        return this.single();
      },
      order() {
        return this;
      },
      not() {
        return this;
      },
      neq() {
        return this;
      },
      gte() {
        return this;
      },
      range(offset: number) {
        if (offset) return { throwOnError: () => result([]) };
        return this;
      },
      or() {
        return this;
      },
      throwOnError: execute,
      then(
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown,
      ) {
        return execute().then(resolve, reject);
      },
    };
    return query;
  });
  mocks.rpc.mockImplementation(
    (name: string, args: Record<string, unknown>) => {
      if (name === "reserve_ai_usage") {
        events.push("reserve");
        expect(args).toEqual({ p_user: "student", p_scope: "student" });
        if (
          allowance === "minute" ||
          (finalSlot && (reservations.size || settled.size))
        )
          return result({ ok: false, retryAfterSec: 60 });
        if (allowance === "hour")
          return result({ ok: false, retryAfterSec: 3600 });
        const id = `reservation-${events.filter((e) => e === "reserve").length}`;
        reservations.add(id);
        return result({ ok: true, reservationId: id });
      }
      if (name === "ai_spend_for_prefixes") return result(0);
      if (name === "record_reserved_ai_usage") {
        const ids = args.p_reservations as string[];
        expect(ids).toHaveLength(1);
        // Model the RPC replacing pending capacity with completed usage once.
        for (const id of ids) {
          if (reservations.delete(id)) settled.add(id);
        }
        events.push("usage recorded");
        return result(null);
      }
      if (name === "finish_versioned_session") {
        if (retryFinish) {
          retryFinish = false;
          return result(null);
        }
        const session = sessions.get(String(args.p_id))!;
        Object.assign(session, args.p_result, {
          finished_at: "2026-10-20T00:00:00Z",
        });
        return result(structuredClone(session));
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  );
  mocks.provider.mockImplementation(
    async (options: { response_format: { json_schema: { name: string } } }) => {
      expect(allowance).toBe("allowed");
      expect(dailyChecked).toBe(true);
      expect(events.indexOf("reserve")).toBeGreaterThan(
        events.indexOf("answer saved"),
      );
      expect(events.indexOf("daily check")).toBeGreaterThan(
        events.indexOf("reserve"),
      );
      expect(aiUsageReservationIds()).toHaveLength(1);
      const task = options.response_format.json_schema.name;
      events.push(`provider:${task}`);
      const output =
        task === "session_summary"
          ? summary
          : task === "mark_written"
            ? GradeSchema.parse(grade)
            : CheckSchema.strip().parse(grade);
      return {
        choices: [
          {
            message: { content: JSON.stringify(output) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      };
    },
  );
});
afterEach(() => vi.unstubAllEnvs());

const finish = (id = "sprint") =>
  POST(new Request("http://localhost/api", { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
const rpcCalls = (name: string) =>
  mocks.rpc.mock.calls.filter(([fn]) => fn === name);

it.each(["minute", "hour", "daily", "allowed"] as const)(
  "finish: answer saved after the AI check still hits the AI limits (%s)",
  async (limit) => {
    allowance = limit;
    const response = await finish();
    expect(mocks.snapshot).toHaveBeenCalledTimes(1);
    expect(
      mocks.snapshot.mock.results[0].value.every(
        (a: Attempt) => !a.answer_text,
      ),
    ).toBe(true);
    expect(mocks.load).toHaveBeenCalled();
    expect(rpcCalls("reserve_ai_usage")).toHaveLength(1);
    if (limit === "allowed") {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        finished: true,
        score: 8,
        max_score: 8,
        summary,
      });
      expect(events.filter((e) => e.startsWith("provider:"))).toEqual([
        "provider:mark_written",
        "provider:check_written",
        "provider:mark_written",
        "provider:check_written",
        "provider:session_summary",
      ]);
      expect(settled).toEqual(new Set(["reservation-1"]));
      expect(rpcCalls("record_reserved_ai_usage")).toHaveLength(5);
      expect(sessions.get("sprint")?.finished_at).not.toBeNull();
    } else {
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe(
        limit === "minute" ? "60" : limit === "hour" ? "3600" : "86400",
      );
      expect(await response.json()).toEqual({
        error:
          limit === "daily"
            ? "You've reached today's sprint limit. Try again tomorrow."
            : AI_RATE_LIMIT_MESSAGE,
      });
      expect(mocks.provider).not.toHaveBeenCalled();
      expect(rpcCalls("record_reserved_ai_usage")).toHaveLength(0);
      expect(rpcCalls("finish_versioned_session")).toHaveLength(0);
      expect(sessions.get("sprint")?.finished_at).toBeNull();
      expect(attempts.every((a) => a.status !== "marked")).toBe(true);
    }
    expect(reservations.size).toBe(0);
    expect(mocks.release).toHaveBeenCalledTimes(
      limit === "minute" || limit === "hour" ? 0 : 1,
    );
  },
);

it.each(["minute", "hour", "daily"] as const)(
  "finish: a raced-in marked answer cannot bypass %s limits through a summary",
  async (limit) => {
    allowance = limit;
    summaryOnly = true;
    expect((await finish()).status).toBe(429);
    expect(rpcCalls("reserve_ai_usage")).toHaveLength(1);
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(rpcCalls("finish_versioned_session")).toHaveLength(0);
    expect(sessions.get("sprint")?.finished_at).toBeNull();
    expect(reservations.size).toBe(0);
  },
);

it("finish: retries after the late save reuse and settle one reservation", async () => {
  retryFinish = true;
  // The first schema-invalid grade forces a paid correction call.
  const provider = mocks.provider.getMockImplementation()!;
  mocks.provider.mockImplementationOnce(async (options) => {
    const reply = await provider(options);
    reply.choices[0].message.content = "{}";
    return reply;
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect((await finish()).status).toBe(200);
    expect(rpcCalls("reserve_ai_usage")).toHaveLength(1);
    expect(rpcCalls("finish_versioned_session")).toHaveLength(2);
    expect(mocks.provider).toHaveBeenCalledTimes(7);
    expect(settled).toEqual(new Set(["reservation-1"]));
    expect(reservations.size).toBe(0);
  } finally {
    warn.mockRestore();
  }
});

it.each(["same", "different"])(
  "finish: concurrent late saves in the %s session compete for the final atomic allowance",
  async (target) => {
    if (target === "different") {
      sessions.set("other", { ...sessions.get("sprint")!, id: "other" });
      attempts.push(attempt("c", "other"));
    } else {
      // Simulate background marking so both Finish calls reach the summary guard.
      summaryOnly = true;
    }
    finalSlot = true;
    // Both routes must observe blank snapshots before either engine may reload.
    const snapshot = mocks.snapshot.getMockImplementation()!;
    const load = mocks.load.getMockImplementation()!;
    let bothRead!: () => void;
    const ready = new Promise<void>((resolve) => {
      bothRead = resolve;
    });
    mocks.snapshot.mockImplementation((rows) => {
      const value = snapshot(rows);
      if (mocks.snapshot.mock.calls.length === 2) bothRead();
      return value;
    });
    mocks.load.mockImplementation(async (id) => {
      await ready;
      return load(id);
    });
    const responses = await Promise.all([
      finish(),
      finish(target === "same" ? "sprint" : "other"),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(rpcCalls("reserve_ai_usage")).toHaveLength(2);
    expect(rpcCalls("finish_versioned_session")).toHaveLength(1);
    expect([...sessions.values()].filter((s) => s.finished_at)).toHaveLength(1);
    expect(settled.size).toBe(1);
    expect(reservations.size).toBe(0);
  },
);
