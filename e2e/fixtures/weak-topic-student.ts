import { randomUUID } from "node:crypto";
import { test as base } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { adminClient } from "../helpers";
import { assertTestSupabaseUrl } from "../guard";

// Each test owns a synthetic account; teardown cascades only its own study history.
export const test = base.extend<{
  historyStudent: {
    userId: string;
    addAnswers: (count: number, mark?: number) => Promise<void>;
  };
}>({
  historyStudent: async ({ page, baseURL }, runFixture) => {
    const db = adminClient()!;
    const email = `claro-history-${randomUUID()}@example.com`;
    const password = `${randomUUID()}Aa1!`;
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Synthetic history student" },
    });
    if (error || !data.user)
      throw error ?? new Error("Could not create synthetic student");
    const userId = data.user.id;
    try {
      const { error: profileError } = await db
        .from("profiles")
        .update({ year_level: 12 })
        .eq("id", userId);
      if (profileError) throw profileError;
      if (!baseURL) throw new Error("Browser tests need a base URL");
      const cookies: Array<
        Parameters<ReturnType<typeof page.context>["addCookies"]>[0][number]
      > = [];
      const auth = createServerClient(
        assertTestSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          cookies: {
            getAll: () => [],
            setAll: (updates) => {
              cookies.push(
                ...updates.map(({ name, value }) => ({
                  name,
                  value,
                  url: new URL("/", baseURL).href,
                  sameSite: "Lax" as const,
                })),
              );
            },
          },
        },
      );
      const { error: signInError } = await auth.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      await page.context().addCookies(cookies);
      await page.goto("/student");
      await runFixture({
        userId,
        async addAnswers(count, mark = 1) {
          const { data: session, error: sessionError } = await db
            .from("sessions")
            .insert({
              user_id: userId,
              kind: "single",
              config: {
                question: {
                  topic_id: "t3-inflation",
                  marks: 5,
                  verb: "Explain",
                },
              },
            })
            .select("id")
            .single();
          if (sessionError) throw sessionError;
          const { error: attemptError } = await db.from("attempts").insert(
            Array.from({ length: count }, (_, i) => ({
              user_id: userId,
              session_id: session.id,
              position: i + 1,
              answer_text: "Synthetic practice answer",
              status: "marked",
              mark,
              max_marks: 5,
              marked_at: new Date().toISOString(),
            })),
          );
          if (attemptError) throw attemptError;
        },
      });
    } finally {
      const { error: cleanupError } = await db.auth.admin.deleteUser(userId);
      if (cleanupError) throw cleanupError;
    }
  },
});
export { expect } from "@playwright/test";
