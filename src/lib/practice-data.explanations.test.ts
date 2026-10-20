// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  attempts: vi.fn(),
  keys: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireProfile: async () => ({ id: "u" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle: mocks.session,
      order: mocks.attempts,
    }),
  }),
}));
vi.mock("@/utils/supabase/admin", () => ({ admin: mocks.admin }));
import { loadSprint } from "./practice-data";
const rows = [
  {
    id: "checked",
    question_id: "q1",
    status: "marked",
    question: { type: "mcq" },
  },
  {
    id: "unchecked",
    question_id: "q2",
    status: "pending",
    question: { type: "mcq" },
  },
  {
    id: "written",
    question_id: "q3",
    status: "marked",
    question: { type: "short" },
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ data: { config: { feedback: "each" } } });
  mocks.attempts.mockResolvedValue({ data: structuredClone(rows) });
  mocks.keys.mockResolvedValue({
    data: [{ id: "q1", explanation: "Stored explanation" }],
  });
  mocks.admin.mockReturnValue({
    from: () => ({
      select() {
        return this;
      },
      in: mocks.keys,
    }),
  });
});
it("restores only checked MC explanations after ownership lookup", async () => {
  expect((await loadSprint("s")).explanations).toEqual({
    checked: "Stored explanation",
  });
  expect(mocks.keys).toHaveBeenCalledExactlyOnceWith("id", ["q1", "q3"]);
});
it("keeps checked MC explanations after finishing without attaching written model answers", async () => {
  mocks.session.mockResolvedValue({
    data: { config: { feedback: "each" }, finished_at: "2026-10-14" },
  });
  const result = await loadSprint("s");
  expect(result.explanations).toEqual({ checked: "Stored explanation" });
  expect(result.attempts.find((a) => a.id === "written")).not.toHaveProperty(
    "sample_answer",
  );
  expect(mocks.keys).toHaveBeenCalledExactlyOnceWith("id", ["q1"]);
});
it.each(["end", "unchecked", "foreign"])(
  "does not query answer keys for %s sessions",
  async (state) => {
    if (state === "end")
      mocks.session.mockResolvedValue({
        data: { config: { feedback: "end" } },
      });
    if (state === "unchecked")
      mocks.attempts.mockResolvedValue({ data: [rows[1]] });
    if (state === "foreign") {
      mocks.session.mockResolvedValue({ data: null });
      await expect(loadSprint("s")).rejects.toThrow("404");
    } else expect((await loadSprint("s")).explanations).toEqual({});
    expect(mocks.admin).not.toHaveBeenCalled();
  },
);
it("reports an explanation read failure rather than losing checked feedback silently", async () => {
  mocks.keys.mockResolvedValue({ error: new Error("private") });
  await expect(loadSprint("s")).rejects.toThrow(
    "Could not load your checked explanations.",
  );
});
