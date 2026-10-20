// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { admin } from "@/utils/supabase/admin";
import { lookupAuthUsers } from "./admin-auth-users";

const now = Date.parse("2026-10-09T03:00:00Z");

function client(
  batches: { id: string; email?: string; banned_until?: string }[][],
) {
  const listUsers = vi.fn(async ({ page }: { page: number }) => ({
    data: { users: batches[page - 1] ?? [] },
    error: null,
  }));
  const db = { auth: { admin: { listUsers } } } as unknown as ReturnType<
    typeof admin
  >;
  return { db, listUsers };
}

it("preserves first-match and last-match policies across Auth pages", async () => {
  const first = { id: "wanted", email: "first", banned_until: "2099-01-01" };
  const last = { id: "wanted", email: "last" };
  const batch = [
    first,
    ...Array.from({ length: 999 }, (_, i) => ({ id: `other-${i}` })),
  ];
  for (const firstMatch of [false, true]) {
    const { db, listUsers } = client([batch, [last, { id: "second" }]]);
    const users = await lookupAuthUsers(db, ["wanted", "second"], now, {
      firstMatch,
    });
    expect([...users.keys()]).toEqual(["wanted", "second"]);
    expect(users.get("wanted")).toEqual({
      email: firstMatch ? "first" : "last",
      blocked: firstMatch,
    });
    expect(listUsers.mock.calls).toEqual([
      [{ page: 1, perPage: 1000 }],
      [{ page: 2, perPage: 1000 }],
    ]);
  }
});

it("stops on a full page when all requested IDs were found", async () => {
  const { db, listUsers } = client([
    Array.from({ length: 1000 }, () => ({ id: "wanted" })),
  ]);
  expect((await lookupAuthUsers(db, ["wanted"], now)).size).toBe(1);
  expect(listUsers).toHaveBeenCalledTimes(1);
});

it("reads the terminal empty page when a requested ID is missing", async () => {
  const { db, listUsers } = client([
    Array.from({ length: 1000 }, () => ({ id: "other" })),
  ]);
  expect((await lookupAuthUsers(db, ["missing"], now)).size).toBe(0);
  expect(listUsers).toHaveBeenCalledTimes(2);
});

it("preserves raw Auth errors and the student email error wording", async () => {
  const { db } = client([]);
  const error = new Error("Auth unavailable");
  vi.mocked(db.auth.admin.listUsers).mockResolvedValueOnce({
    data: { users: [] },
    error,
  } as never);
  await expect(lookupAuthUsers(db, ["wanted"], now)).rejects.toBe(error);
  vi.mocked(db.auth.admin.listUsers).mockResolvedValueOnce({
    data: { users: [] },
    error,
  } as never);
  await expect(
    lookupAuthUsers(db, ["wanted"], now, {
      errorMessage: "Could not load student emails.",
    }),
  ).rejects.toThrow("Could not load student emails.");
});

it("uses the caller's clock and treats missing, expired and invalid bans as unblocked", async () => {
  const { db } = client([
    [
      { id: "equal", banned_until: new Date(now).toISOString() },
      { id: "expired", banned_until: "2020-01-01" },
      { id: "invalid", banned_until: "invalid" },
      { id: "missing" },
    ],
  ]);
  expect([
    ...(
      await lookupAuthUsers(db, ["equal", "expired", "invalid", "missing"], now)
    ).values(),
  ]).toEqual(Array.from({ length: 4 }, () => ({ email: "", blocked: false })));
});
