import { expect, it, vi } from "vitest";

const signInMock = vi.fn().mockResolvedValue({ error: null });
const signOutMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signOut: signOutMock,
      signInWithPassword: signInMock,
      getUser: async () => ({ data: { user: null } }),
    },
  }),
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { signIn, signOut } from "./actions";

it("signs out this device only, never the student's other sessions", async () => {
  await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");
  expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
});

it.each([
  ["/student/sprint?x=1#answer", "/student/sprint?x=1#answer"],
  ["/\\evil.com", "/student"],
  ["//evil.com", "/student"],
  ["/\nevil.com", "/student"],
])("validates the sign-in return destination %j", async (next, expected) => {
  const form = new FormData();
  form.set("email", "student@example.com");
  form.set("password", "password123");
  form.set("next", next);
  await expect(signIn({}, form)).rejects.toThrow("NEXT_REDIRECT");
  const { redirect } = await import("next/navigation");
  expect(redirect).toHaveBeenLastCalledWith(expected);
});
