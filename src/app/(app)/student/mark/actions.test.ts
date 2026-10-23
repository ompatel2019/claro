// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ admin: vi.fn() }));
vi.mock("@/lib/single-check-data", () => ({ bankQuestionAvailable: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/session-finish", () => ({ finishOpenSessions: vi.fn() }));
import { createClient } from "@/utils/supabase/server";
import { admin } from "@/utils/supabase/admin";
import { singleSlotIds } from "@/lib/single-check";
import { bankQuestionAvailable } from "@/lib/single-check-data";
import { createCheck, restoreUnreadableCheck } from "./actions";
import { after } from "next/server";
import { finishOpenSessions } from "@/lib/session-finish";
const sessions = new Map<string, Record<string, unknown>>();
const attempts: Record<string, unknown>[] = [];
let failAttempt = false;
const question = {
  stem: "Explain the causes of inflation.",
  marks: 4,
  verb: "explain",
  topic_id: null,
  criteria_text: null,
};
function from(table: string) {
  let deleting = false;
  let id = "";
  const chain = {
    select: () => chain,
    eq: (key: string, value: string) => {
      if (key === "id") id = value;
      return chain;
    },
    gte: () => chain,
    delete: () => {
      deleting = true;
      return chain;
    },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve().then(() => {
        if (deleting) sessions.delete(id);
        return resolve({ data: [...sessions.values()], error: null });
      }),
    insert: async (row: Record<string, unknown>) => {
      if (table === "sessions") {
        const id = String(row.id);
        if (sessions.has(id)) return { error: { code: "23505" } };
        sessions.set(id, row);
      } else {
        if (failAttempt) {
          failAttempt = false;
          return { error: { code: "error" } };
        }
        attempts.push(row);
      }
      return { error: null };
    },
  };
  return chain;
}
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.stubEnv("ENABLE_OWN_QUESTION_MARKING", "true");
  vi.clearAllMocks();
  sessions.clear();
  attempts.length = 0;
  failAttempt = false;
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
  } as never);
  vi.mocked(admin).mockReturnValue({ from } as never);
  vi.mocked(bankQuestionAvailable).mockResolvedValue(false);
});
it("stores the exact config and nullable question in one single session", async () => {
  const result = await createCheck({ source: "own", question });
  expect(result).toMatchObject({
    sessionId: expect.any(String),
    attemptId: expect.any(String),
  });
  expect([...sessions.values()][0]).toMatchObject({
    kind: "single",
    user_id: "u",
    config: { question },
  });
  expect(attempts[0]).toMatchObject({
    question_id: null,
    position: 1,
    user_id: "u",
  });
  // No resume: the student's earlier open sprints and decks finish after the response.
  await (vi.mocked(after).mock.calls[0][0] as () => Promise<unknown>)();
  expect(finishOpenSessions).toHaveBeenCalledWith("u", {
    keep: (result as { sessionId: string }).sessionId,
  });
});
it("reserves the last daily check atomically across concurrent requests", async () => {
  for (let i = 0; i < 19; i++)
    sessions.set(`legacy-${i}`, { id: `legacy-${i}` });
  const results = await Promise.all([
    createCheck({ source: "own", question }),
    createCheck({ source: "own", question }),
  ]);
  expect(results.filter((r) => "sessionId" in r)).toHaveLength(1);
  expect(results.filter((r) => "error" in r)).toEqual([
    { error: "You've used today's 20 checks. More at midnight." },
  ]);
  expect(sessions.size).toBe(20);
  expect(attempts).toHaveLength(1);
});
it("releases a failed reservation so a retry can use that check", async () => {
  failAttempt = true;
  expect(await createCheck({ source: "own", question })).toMatchObject({
    error: expect.stringContaining("Couldn't save your answer"),
  });
  expect(sessions.size).toBe(0);
  expect(await createCheck({ source: "own", question })).toMatchObject({
    sessionId: expect.any(String),
  });
  expect(sessions.size).toBe(1);
});
it("rejects unavailable bank questions and invalid own questions before writing", async () => {
  expect(
    await createCheck({ source: "bank", question_id: "live-paper-question" }),
  ).toMatchObject({ error: expect.stringContaining("no longer available") });
  expect(
    await createCheck({ source: "own", question: { ...question, marks: 21 } }),
  ).toHaveProperty("error");
  expect(sessions.size).toBe(0);
  expect(attempts).toHaveLength(0);
});
it("requires authentication before reserving a check", async () => {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: null } }) },
  } as never);
  expect(await createCheck({ source: "own", question })).toMatchObject({
    error: expect.stringContaining("session expired"),
  });
  expect(admin).not.toHaveBeenCalled();
});

it("restores only an owned unreadable check that has not been submitted", async () => {
  const started_at = "2026-10-09T01:00:00Z";
  const session_id = (await singleSlotIds("u", new Date(started_at)))[0];
  const read = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        session_id,
        status: "unreadable",
        session: { kind: "single", started_at, finished_at: null },
      },
      error: null,
    }),
  };
  read.select.mockReturnValue(read);
  read.eq.mockReturnValue(read);
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    from: () => read,
  } as never);
  const save = {
    update: vi.fn(),
    eq: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve),
  };
  save.update.mockReturnValue(save);
  save.eq.mockReturnValue(save);
  vi.mocked(admin).mockReturnValue({ from: () => save } as never);
  expect(await restoreUnreadableCheck("a")).toEqual({ error: null });
  expect(read.eq).toHaveBeenCalledWith("user_id", "u");
  expect(save.update).toHaveBeenCalledWith({ status: "transcribed" });
  expect(save.eq).toHaveBeenCalledWith("status", "unreadable");
  read.maybeSingle.mockResolvedValue({
    data: {
      session_id,
      status: "unreadable",
      session: { kind: "single", started_at, finished_at: started_at },
    },
    error: null,
  });
  save.update.mockClear();
  expect(await restoreUnreadableCheck("a")).toMatchObject({
    error: expect.stringContaining("no longer editable"),
  });
  expect(save.update).not.toHaveBeenCalled();
});

it.each([
  { answer_text: "word ".repeat(3001), transcript: null, image_paths: null },
  {
    answer_text: null,
    transcript: "Confirmed answer",
    image_paths: ["other-user/photo.png"],
  },
  {
    answer_text: null,
    transcript: "Confirmed answer",
    image_paths: Array(9).fill("u/photo.png"),
  },
])(
  "rejects invalid answers and foreign photo paths before finishing a check",
  async (answer) => {
    const { finishCheck } = await import("./actions");
    const started_at = "2026-10-09T01:00:00Z";
    const id = (await singleSlotIds("u", new Date(started_at)))[0];
    const read = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id, started_at } }),
      single: vi.fn().mockResolvedValue({ data: answer, error: null }),
    };
    read.select.mockReturnValue(read);
    read.eq.mockReturnValue(read);
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
      from: () => read,
    } as never);
    expect(await finishCheck(id)).toMatchObject({
      error: expect.stringContaining("Add your answer"),
    });
    expect(admin).not.toHaveBeenCalled();
    expect(read.eq).toHaveBeenCalledWith("user_id", "u");
  },
);

it.each([undefined, "false", "TRUE"])(
  "rejects own checks when the flag is %s before database writes",
  async (flag) => {
    vi.stubEnv("ENABLE_OWN_QUESTION_MARKING", flag);
    expect(await createCheck({ source: "own", question })).toEqual({
      error:
        "Own-question marking is currently unavailable. Choose a question from the Claro bank.",
    });
    expect(admin).not.toHaveBeenCalled();
    expect(sessions.size).toBe(0);
    expect(attempts).toHaveLength(0);
  },
);

it("stores the bank question unchanged after checking it with the user client", async () => {
  vi.mocked(bankQuestionAvailable).mockResolvedValue(true);
  const question_id = "2024-q21b";
  expect(await createCheck({ source: "bank", question_id })).toMatchObject({
    sessionId: expect.any(String),
    attemptId: expect.any(String),
  });
  expect(bankQuestionAvailable).toHaveBeenCalledWith(
    await vi.mocked(createClient).mock.results[0].value,
    question_id,
  );
  expect([...sessions.values()][0].config).toEqual({ question_id });
  expect(attempts[0].question_id).toBe(question_id);
});

it.each(["", null, 42])(
  "rejects malformed bank ID %s before lookup or writes",
  async (question_id) => {
    expect(await createCheck({ source: "bank", question_id })).toHaveProperty(
      "error",
    );
    expect(bankQuestionAvailable).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  },
);
