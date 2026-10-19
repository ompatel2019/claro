import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { admin } from "@/utils/supabase/admin";

/** Per-student limits; admins are exempt. Keep RPC thresholds in sync. */
export const AI_RATE_LIMIT_PER_MINUTE = 20;
export const AI_RATE_LIMIT_PER_HOUR = 200;

export const AI_RATE_LIMIT_MESSAGE =
  "You're going a bit fast, try again in a minute";
export const AUTOFILL_RATE_LIMIT_MESSAGE =
  "You've used today's 10 autofill calls. Paste your own guidelines or try tomorrow.";

export type RateLimitResult =
  | { ok: true; reservationId?: string }
  | { ok: false; error: string; retryAfterSec: number };

const reservations = new AsyncLocalStorage<string[]>();
export function aiUsageReservationIds() {
  return reservations.getStore() ?? [];
}

/** Release unused capacity on every exit; crashed workers expire after 10 minutes. */
export async function withAiUsageReservation<T>(
  result: Extract<RateLimitResult, { ok: true }>,
  work: () => Promise<T>,
): Promise<T> {
  const id = result.reservationId;
  if (!id) return work();
  try {
    return await reservations.run([...aiUsageReservationIds(), id], work);
  } finally {
    await releaseReservation(id);
  }
}

async function releaseReservation(id: string) {
  try {
    const { error } = await admin()
      .from("ai_usage_reservations")
      .delete()
      .eq("id", id);
    if (error) throw error;
  } catch (error) {
    console.error("ai reservation release failed (will expire)", error);
  }
}

export class AiUsageGuardError extends Error {}

export class AiRateLimitError extends AiUsageGuardError {
  constructor(readonly result: Extract<RateLimitResult, { ok: false }>) {
    super(result.error);
  }
}

const paidWorkGuard = new AsyncLocalStorage<() => Promise<void>>();

/** Also check at the provider boundary, after any engine answer reloads. */
export async function ensureAiUsageReservation() {
  await paidWorkGuard.getStore()?.();
}

/** Finish reserves once, lazily for deterministic sessions that gain an answer. */
export async function withDeferredAiUsageReservation<T>(
  reserve: () => Promise<RateLimitResult>,
  validate: () => Promise<void>,
  work: (ensure: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const ids = [...aiUsageReservationIds()];
  let id: string | undefined;
  let checking: Promise<void> | undefined;
  const ensure = () =>
    (checking ??= (async () => {
      const result = await reserve();
      if (!result.ok) throw new AiRateLimitError(result);
      id = result.reservationId;
      if (id) ids.push(id);
      await validate();
    })().catch((error) => {
      if (error instanceof AiUsageGuardError) throw error;
      throw new AiUsageGuardError(
        error instanceof Error
          ? error.message
          : "Could not verify AI allowance",
      );
    }));
  try {
    return await reservations.run(ids, () =>
      paidWorkGuard.run(ensure, () => work(ensure)),
    );
  } finally {
    if (id) await releaseReservation(id);
  }
}

/** Reserve atomically before paid work. Role/usage database errors fail closed. */
export async function assertStudentAiRateLimit(opts: {
  userId: string;
  role?: string | null;
  scope?: "student" | "autofill";
}): Promise<RateLimitResult> {
  const scope = opts.scope ?? "student";
  if (scope === "student" && opts.role === "admin") return { ok: true };
  const error =
    scope === "autofill" ? AUTOFILL_RATE_LIMIT_MESSAGE : AI_RATE_LIMIT_MESSAGE;
  try {
    const { data, error: dbError } = await admin().rpc("reserve_ai_usage", {
      p_user: opts.userId,
      p_scope: scope,
    });
    if (dbError) throw dbError;
    if (data?.ok === true) {
      if (typeof data.reservationId === "string") return data;
      // Only the DB-confirmed admin exemption may omit a reservation.
      if (scope === "student" && data.adminExempt === true) return { ok: true };
    }
    if (data?.ok === false && [60, 3600, 86400].includes(data.retryAfterSec))
      return { ok: false, error, retryAfterSec: data.retryAfterSec };
    throw new Error("Invalid AI reservation result");
  } catch (cause) {
    console.error("ai reservation failed (fail-closed)", cause);
    return {
      ok: false,
      error,
      retryAfterSec: scope === "autofill" ? 86400 : 60,
    };
  }
}

export function rateLimitedResponse(
  result: Extract<RateLimitResult, { ok: false }>,
) {
  return Response.json(
    { error: result.error },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec) },
    },
  );
}
