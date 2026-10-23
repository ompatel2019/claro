"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { clientEnv } from "@/env/client";
import { profileSchema, passwordSchema } from "@/lib/profile";
import { welcomeProfileSchema } from "@/lib/welcome";
import { requireProfile } from "@/lib/auth";
import { finishOpenSessions } from "@/lib/session-finish";
import { createClient } from "@/utils/supabase/server";
export type FormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  sessionExpired?: boolean;
};
const SprintConfig = z
  .object({
    mode: z.enum(["mcq", "short", "mixed"]),
    topics: z
      .array(z.string().min(1))
      .max(2, "Choose up to two topics.")
      .default([]),
    subtopics: z.array(z.string().min(1)).max(40).default([]),
    size_by: z.enum(["marks", "questions"]).optional(),
    target: z.number().int().optional(),
    mcq_count: z.number().int().min(0).max(100).optional(),
    short_count: z.number().int().min(0).max(15).optional(),
    marks_per_short: z.number().int().min(1).max(100).nullable().optional(),
    short_marks: z.number().int().min(0).max(100).optional(),
    difficulty: z
      .array(z.enum(["foundation", "standard", "challenging"]))
      .default([]),
    verbs: z.array(z.string().max(40)).max(20).default([]),
    origins: z.array(z.enum(["nesa", "a1"])).default([]),
    history: z
      .enum(["prefer_new", "new_only", "mistakes", "flagged", "any"])
      .default("prefer_new"),
    order: z
      .enum(["exam", "shuffled"])
      .default("exam")
      .transform(() => "exam" as const),
    timed: z.boolean().default(true),
    short_min_per_mark: z.number().min(0.25).max(10).default(1.5),
    mcq_min_per_q: z.number().min(0.25).max(10).default(1),
    on_timeout: z.literal("overtime").default("overtime"),
    feedback: z.enum(["end", "each"]).default("end"),
  })
  .refine(
    (c) =>
      c.mode !== "mixed" ||
      c.mcq_count === undefined ||
      c.short_count !== undefined ||
      c.short_marks === undefined ||
      c.mcq_count + c.short_marks === (c.target ?? 45),
    { message: "Mixed counts must add up to the total." },
  )
  .refine(
    (c) =>
      c.mode !== "mixed" ||
      c.short_count === undefined ||
      (c.size_by === "questions" &&
        c.mcq_count !== undefined &&
        c.mcq_count <= 40 &&
        c.mcq_count + c.short_count >= 5 &&
        c.mcq_count + c.short_count === c.target),
    { message: "Mixed question counts must add up to the total (at least 5)." },
  );
/** §3.2: the setup page (and quick starts) post the config as JSON; start_sprint validates the rest. */
export async function startSprint(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("config")));
  } catch {
    return { error: "Your sprint settings could not be read." };
  }
  const parsed = SprintConfig.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await createClient();
  const { data, error } = await db.rpc("start_sprint", {
    p_config: parsed.data,
  });
  if (error)
    return {
      error: /no questions match/.test(error.message)
        ? "No questions match these settings."
        : /out of range|invalid|at most/.test(error.message)
          ? "Check your sprint settings."
          : "Try again.",
    };
  // No resume: starting a session finishes the student's other open ones.
  after(() => finishOpenSessions(profile.id, { keep: String(data) }));
  redirect(`/student/sprint/${data}`);
}
export async function saveProfile(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const db = await createClient();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user)
    return {
      error: "Your session expired. Sign in again.",
      sessionExpired: true,
    };
  const parsed = (
    form.get("welcome") === "true" ? welcomeProfileSchema : profileSchema
  ).safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error: parsed.error.issues[0].message,
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  const { error } = await db
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select("id")
    .single();
  if (error) return { error: "Couldn't save your details. Try again" };
  revalidatePath("/", "layout");
  return { message: "Saved" };
}

export async function changePassword(
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error: parsed.error.issues[0].message,
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  const db = await createClient();
  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser();
  if (userError || !user?.email)
    return {
      error: "Your session expired. Sign in again.",
      sessionExpired: true,
    };
  // Verify in an isolated client: never replace the browser's current session.
  const verifier = createAuthClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { data: verified, error: verifyError } =
    await verifier.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.current_password,
    });
  if (verifyError || verified.user?.id !== user.id)
    return {
      error:
        verifyError?.code === "invalid_credentials"
          ? "Current password is wrong"
          : "Couldn't verify your password. Try again",
      fieldErrors:
        verifyError?.code === "invalid_credentials"
          ? { current_password: ["Current password is wrong"] }
          : undefined,
    };
  await verifier.auth.signOut({ scope: "local" });
  const { error } = await db.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: error.message };
  return { message: "Your password is updated." };
}

export async function signOutEverywhere() {
  const db = await createClient();
  await db.auth.signOut({ scope: "global" });
  redirect("/sign-in");
}
