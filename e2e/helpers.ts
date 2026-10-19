import { expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertTargetVerified, assertTestSupabaseUrl } from "./guard";

export async function expectStackedBelow(text: Locator, button: Locator) {
  await expect(text).toBeVisible();
  await expect(button).toBeVisible();
  await expect
    .poll(async () => {
      const [copy, control] = await Promise.all([
        text.boundingBox(),
        button.boundingBox(),
      ]);
      return !!copy && !!control && control.y >= copy.y + copy.height;
    })
    .toBe(true);
}

/** Retry geometry while async pool counts and wrapped summaries settle. */
export async function expectNoOverlap(a: Locator, b: Locator) {
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  await expect
    .poll(async () => {
      const [first, second] = await Promise.all([
        a.boundingBox(),
        b.boundingBox(),
      ]);
      if (!first || !second) return true;
      return (
        first.x < second.x + second.width &&
        first.x + first.width > second.x &&
        first.y < second.y + second.height &&
        first.y + first.height > second.y
      );
    })
    .toBe(false);
}

async function signInAs(
  page: Page,
  email: string | undefined,
  password: string | undefined,
  destination: "/student" | "/admin" | "/student/sprint",
  nextPath?: string,
) {
  if (!email || !password) {
    const role = destination === "/admin" ? "ADMIN" : "STUDENT";
    throw new Error(
      `Missing sign-in credentials: provide both ${role}_EMAIL and ${role}_PASSWORD (or explicit credentials for signIn).`,
    );
  }
  // Watch/UI modes can keep running after a failed globalSetup.
  assertTargetVerified();
  await page.goto(
    nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : "/sign-in",
  );
  const authenticated = async () =>
    (await page.context().cookies()).some((cookie) =>
      /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name),
    );
  await expect(async () => {
    if (!(await authenticated())) {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect.poll(authenticated).toBe(true);
    }
    // Establish a session on a protected page, independent of cold dev redirect timing.
    await page.goto(destination);
    await expect(page).toHaveURL(new RegExp(`${destination}$`), {
      timeout: 5000,
    });
  }).toPass({ timeout: 60000 });
}
/** Accept a sprint destination or isolated synthetic credentials. */
export async function signIn(
  page: Page,
  emailOrNext = process.env.STUDENT_EMAIL!,
  password = process.env.STUDENT_PASSWORD!,
) {
  const nextPath = emailOrNext === "/student/sprint" ? emailOrNext : undefined;
  await signInAs(
    page,
    nextPath ? process.env.STUDENT_EMAIL! : emailOrNext,
    password,
    nextPath ?? "/student",
    nextPath,
  );
}
/** Signs in as the administrator and opens their protected dashboard. */
export async function signInAdmin(page: Page) {
  await signInAs(
    page,
    process.env.ADMIN_EMAIL!,
    process.env.ADMIN_PASSWORD!,
    "/admin",
  );
}
export function adminClient() {
  return process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? createClient(
        assertTestSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
        process.env.SUPABASE_SECRET_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
    : null;
}
export async function cleanupSessions(ids: string[]) {
  const db = adminClient();
  if (db && ids.length) {
    const { error } = await db.from("sessions").delete().in("id", ids);
    if (error) throw new Error("Could not clean up E2E sessions.");
  }
}
const TYPES: Record<string, string> = {
  "Multiple choice": "mcq",
  "Short answer": "short",
  Mixed: "mixed",
};
/** Wait for hydration and each transition so rapid clicks cannot skip a step. */
export async function goToSprintStep(page: Page, target: number) {
  const status = page.getByText(/^Step [1-4] of 4$/);
  let step = Number((await status.textContent())!.match(/Step (\d)/)![1]);
  const next = page.getByRole("button", { name: "Next", exact: true });
  if (step < target) {
    await expect
      .poll(() =>
        next.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith("__reactProps$")),
        ),
      )
      .toBe(true);
  }
  while (step < target) {
    await next.click();
    step++;
    await expect(status).toHaveText(`Step ${step} of 4`);
  }
}
/** Reviews every setup step, preserving URL-prefilled settings. */
export async function reviewSprintSetup(page: Page) {
  await goToSprintStep(page, 4);
}
/** Starts a sprint of one type on Inflation through the §3.2 setup page. */
export async function start(
  page: Page,
  mode: string,
  ids: string[],
  checkEach = false,
) {
  await page.goto(`/student/sprint?type=${TYPES[mode]}&sub=t3-inflation`);
  await expect(page.getByText(/^\d+ questions match/)).toBeVisible();
  if (checkEach) {
    const each = page.getByRole("radio", {
      name: "Check as I go",
    });
    for (let step = 0; step < 4 && !(await each.isVisible()); step++)
      await page.getByRole("button", { name: "Next", exact: true }).click();
    await each.click();
  }
  await reviewSprintSetup(page);
  await page.getByRole("button", { name: /^Start (sprint|with)/ }).click();
  await expect(page).toHaveURL(/\/student\/sprint\/[^/]+$/);
  const id = page.url().split("/").at(-1)!;
  ids.push(id);
  return id;
}
/** MC inputs are visually hidden inside radio cards, so wait, then force. */
export async function pick(page: Page, letter: string) {
  const radio = page.getByRole("radio", {
    name: new RegExp(`^Option ${letter}:`),
  });
  await expect(radio).toBeEnabled();
  await radio.check({ force: true });
}
export async function finish(page: Page) {
  await page
    .getByRole("button", { name: "Finish", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Finish and mark", exact: true })
    .click();
  await expect(page).toHaveURL(/\/results$/, { timeout: 90000 });
}

/** The E2E student's auth id (by STUDENT_EMAIL). */
export async function studentId() {
  const db = adminClient()!;
  let userId = "";
  for (let page = 1; !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    userId =
      data.users.find(
        (u) =>
          u.email?.toLowerCase() === process.env.STUDENT_EMAIL?.toLowerCase(),
      )?.id ?? "";
    if (data.users.length < 1000) break;
  }
  if (!userId) throw new Error("Could not find the E2E student.");
  return userId;
}

/** Snapshot before any ratings; restore existing rows and delete only test-created rows. */
export async function snapshotFlashcardProgress() {
  const db = adminClient()!;
  const userId = await studentId();
  const before: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("flashcard_progress")
      .select("*")
      .eq("user_id", userId)
      .order("flashcard_id")
      .range(from, from + 499);
    if (error) throw error;
    before.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return { userId, before };
}
export async function restoreFlashcardProgress(
  snapshot: Awaited<ReturnType<typeof snapshotFlashcardProgress>>,
  reviewed: Set<string>,
) {
  const db = adminClient()!;
  const { userId, before } = snapshot;
  const created = [...reviewed].filter(
    (id) => !before.some((p) => p.flashcard_id === id),
  );
  if (created.length) {
    const { error } = await db
      .from("flashcard_progress")
      .delete()
      .eq("user_id", userId)
      .in("flashcard_id", created);
    if (error) throw error;
  }
  const existing = before.filter((p) => reviewed.has(p.flashcard_id as string));
  if (existing.length) {
    const { error } = await db
      .from("flashcard_progress")
      .upsert(existing, { onConflict: "user_id,flashcard_id" });
    if (error) throw error;
  }
}

/** Enter a control through keyboard navigation, so native focus-visible applies. */
export async function focusWithKeyboard(page: Page, control: Locator) {
  await control.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(control).toBeFocused();
}
