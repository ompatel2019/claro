import { createClient } from "@/utils/supabase/server";
import {
  AutofillRateLimit,
  autofillRequestSchema,
  generateOwnQuestion,
} from "@/lib/single-check-autofill";

import { rateLimitedResponse } from "@/lib/ai/rate-limit";

export const maxDuration = 150;

export async function POST(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  if (
    process.env.ENABLE_OWN_QUESTION_MARKING !== "true" ||
    process.env.ENABLE_OWN_QUESTION_AUTOFILL !== "true"
  )
    return Response.json(
      { error: "Autofill is unavailable." },
      { status: 403 },
    );
  const parsed = autofillRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Enter a question of 10–3,000 characters and valid marks." },
      { status: 400 },
    );
  try {
    return Response.json(await generateOwnQuestion(user.id, parsed.data));
  } catch (error) {
    if (error instanceof AutofillRateLimit)
      return rateLimitedResponse({
        ok: false,
        error: error.message,
        retryAfterSec: error.retryAfterSec,
      });
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Autofill failed. Please retry.",
      },
      { status: 503 },
    );
  }
}
