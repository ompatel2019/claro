// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { Attempt } from "./practice";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireProfile: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ admin: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("Not found");
  }),
}));

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { admin } from "@/utils/supabase/admin";
import { loadSprint } from "./practice-data";

const profile = { id: "student" };
const session = {
  id: "sprint",
  finished_at: null,
  config: { feedback: "each" },
};

function attempt(
  id: string,
  type: Attempt["question"]["type"] = "short",
  status = "marked",
  feedback: Attempt["feedback"] = null,
) {
  return {
    id,
    question_id: id,
    position: 0,
    question: { type },
    status,
    feedback,
  };
}

function query(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    order: vi.fn().mockResolvedValue({ data, error }),
    in: vi.fn().mockResolvedValue({ data, error }),
  };
}

function setup(rows: unknown[], currentSession: unknown = session) {
  const sessions = query(currentSession);
  const attempts = query(rows);
  const from = vi.fn((table: string) =>
    table === "sessions" ? sessions : attempts,
  );
  vi.mocked(createClient).mockResolvedValue({ from } as never);
  const refs = query([
    { id: "short", sample_answer: "Short model answer." },
    { id: "extended", sample_answer: "Extended model answer." },
    { id: "other-student", sample_answer: "Private answer." },
  ]);
  const adminFrom = vi.fn().mockReturnValue(refs);
  vi.mocked(admin).mockReturnValue({ from: adminFrom } as never);
  return { sessions, attempts, refs, adminFrom };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireProfile).mockResolvedValue(profile as never);
});

it("reads model answers only for the caller's marked written question ids", async () => {
  const { sessions, attempts, refs, adminFrom } = setup([
    attempt("short"),
    attempt("extended", "extended", "marked", { comments: [] }),
    attempt("mcq", "mcq"),
    attempt("pending", "short", "pending"),
    attempt("failed", "short", "failed"),
    attempt("empty", "short", "marked", { note: "No answer" }),
  ]);
  const result = await loadSprint("sprint");
  expect(sessions.eq.mock.calls).toEqual([
    ["id", "sprint"],
    ["user_id", profile.id],
    ["kind", "sprint"],
  ]);
  expect(attempts.eq.mock.calls).toEqual([
    ["session_id", "sprint"],
    ["user_id", profile.id],
  ]);
  expect(adminFrom).toHaveBeenCalledExactlyOnceWith("questions");
  expect(refs.select).toHaveBeenCalledExactlyOnceWith("id, sample_answer");
  expect(refs.in).toHaveBeenCalledExactlyOnceWith("id", ["short", "extended"]);
  for (const row of result.attempts) {
    if (row.id === "short")
      expect(row.sample_answer).toBe("Short model answer.");
    else if (row.id === "extended")
      expect(row.sample_answer).toBe("Extended model answer.");
    else expect(row).not.toHaveProperty("sample_answer");
  }
});

it.each([
  ["finished check mode", { ...session, finished_at: "2026-10-14" }],
  ["exam mode", { ...session, config: { feedback: "end" } }],
  ["legacy exam mode", { ...session, config: {} }],
])("never reads model answers in %s", async (_label, currentSession) => {
  setup([attempt("short")], currentSession);
  const result = await loadSprint("sprint");
  expect(admin).not.toHaveBeenCalled();
  expect(result.attempts[0]).not.toHaveProperty("sample_answer");
});

it.each([
  ["MCQ", [attempt("mcq", "mcq")]],
  ["unmarked written", [attempt("pending", "short", "pending")]],
  ["failed written", [attempt("failed", "short", "failed")]],
  ["No answer", [attempt("empty", "short", "marked", { note: "No answer" })]],
  ["no attempts", []],
])("never opens the admin client for %s attempts", async (_label, rows) => {
  setup(rows);
  const result = await loadSprint("sprint");
  expect(admin).not.toHaveBeenCalled();
  for (const row of result.attempts)
    expect(row).not.toHaveProperty("sample_answer");
});

it("fails cleanly when the admin reference read errors", async () => {
  const rows = [attempt("short")];
  const { refs } = setup(rows);
  refs.in.mockResolvedValue({
    data: [{ id: "short", sample_answer: "Must not be attached." }],
    error: { message: "Private database details" },
  });
  await expect(loadSprint("sprint")).rejects.toThrow(
    "Could not load your questions.",
  );
  expect(rows[0]).not.toHaveProperty("sample_answer");
});

it("treats a missing model answer as null", async () => {
  const { refs } = setup([attempt("short")]);
  refs.in.mockResolvedValue({ data: null, error: null });
  expect((await loadSprint("sprint")).attempts[0].sample_answer).toBeNull();
});

it.each(["sessions", "attempts"] as const)(
  "stops before the admin read when the %s read fails",
  async (table) => {
    const queries = setup([attempt("short")]);
    const failure = {
      data: null,
      error: { message: "Private database details" },
    };
    if (table === "sessions")
      queries.sessions.maybeSingle.mockResolvedValue(failure);
    else queries.attempts.order.mockResolvedValue(failure);
    await expect(loadSprint("sprint")).rejects.toThrow(
      table === "sessions"
        ? "Could not load your session."
        : "Could not load your questions.",
    );
    expect(admin).not.toHaveBeenCalled();
  },
);

it("does not read attempts or references for a session the caller cannot see", async () => {
  const { attempts } = setup([attempt("short")], null);
  await expect(loadSprint("sprint")).rejects.toThrow("Not found");
  expect(attempts.select).not.toHaveBeenCalled();
  expect(admin).not.toHaveBeenCalled();
});
