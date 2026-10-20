// @vitest-environment node
import { createClient as supabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { createClient } from "@/utils/supabase/server";
vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
import { bankQuestionAvailable, bankQuestions } from "./single-check-data";

const rows = [
  { id: "live-short", type: "short", status: "live", inPool: true },
  { id: "live-extended", type: "extended", status: "live", inPool: true },
  { id: "retired", type: "short", status: "retired", inPool: false },
  { id: "draft", type: "short", status: "draft", inPool: false },
  { id: "mcq", type: "mcq", status: "live", inPool: true },
  { id: "live-paper", type: "short", status: "live", inPool: false },
  { id: "hidden", type: "short", status: "live", inPool: false },
  // A row can disappear or retire between the pool and questions reads.
  { id: "retired-after-pool", type: "short", status: "retired", inPool: true },
];
function client(failPath?: string) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith(failPath ?? "never"))
      return new Response(
        JSON.stringify({ message: "Read failed", code: "XX000" }),
        {
          status: 400,
        },
      );
    const pool = url.pathname.endsWith("/rpc/sprint_questions");
    if (pool)
      expect(JSON.parse(String(init?.body))).toEqual({
        p_config: { mode: "mixed", include_extended: true },
      });
    let data = rows.filter((row) => (pool ? row.inPool : true));
    for (const key of ["id", "type", "status"] as const) {
      const filter = url.searchParams.get(key);
      if (filter?.startsWith("eq."))
        data = data.filter((row) => row[key] === filter.slice(3));
      if (filter?.startsWith("neq."))
        data = data.filter((row) => row[key] !== filter.slice(4));
      if (filter?.startsWith("in.("))
        data = data.filter((row) =>
          filter.slice(4, -1).split(",").includes(row[key]),
        );
    }
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  });
  const db = supabaseClient("http://localhost:54321", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  }) as Awaited<ReturnType<typeof createClient>>;
  return { db, fetch };
}
it.each([
  ["live-short", true],
  ["live-extended", true],
  ["retired", false],
  ["draft", false],
  ["mcq", false],
  ["live-paper", false],
  ["hidden", false],
  ["retired-after-pool", false],
  ["unknown", false],
  [" live-short ", false],
  ["LIVE-SHORT", false],
  ["bad,id).or(id.eq.live-short)", false],
])("preserves bank membership for %s", async (id, expected) => {
  const { db, fetch } = client();
  const bank = await bankQuestions(db);
  fetch.mockClear();
  expect(await bankQuestionAvailable(db, id)).toBe(expected);
  expect(expected).toBe(bank.some((q) => q.id === id));
  const urls = fetch.mock.calls.map(([input]) => new URL(String(input)));
  expect(urls.length).toBeLessThanOrEqual(2);
  for (const url of urls) {
    expect(url.searchParams.get("id")).toBe(`eq.${id}`);
    expect(url.searchParams.get("select")).toBe("id");
  }
  expect(urls[0].searchParams.get("type")).toBe("neq.mcq");
  if (urls[1]) expect(urls[1].searchParams.get("status")).toBe("eq.live");
});
it.each(["/rpc/sprint_questions", "/questions"])(
  "propagates errors from %s as the bank loader does",
  async (path) => {
    const { db } = client(path);
    await expect(bankQuestionAvailable(db, "live-short")).rejects.toMatchObject(
      {
        message: "Read failed",
      },
    );
    await expect(bankQuestions(db)).rejects.toMatchObject({
      message: "Read failed",
    });
  },
);
