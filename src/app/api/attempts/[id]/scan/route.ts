import { z } from "zod";
import { BUDGET_USD } from "@/lib/ai/prices";
import {
  assertStudentAiRateLimit,
  rateLimitedResponse,
  withAiUsageReservation,
} from "@/lib/ai/rate-limit";
import { withAttemptUsage } from "@/lib/ai/usage-context";
import { SCAN_PHOTO_BYTE_LIMIT, capWords } from "@/lib/limits";
import { transcribeImage } from "@/lib/marking/engine";
import { admin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 60;

/** ai_usage tag; the spend dashboard rolls everything before ":" into "transcribe". */
const SCAN_TASK = "transcribe_answer:scan";

const fail = (status: number, error: string, extra?: object) =>
  Response.json({ error, ...extra }, { status });
const BAD_TYPE = "Choose a JPEG, PNG or WebP photo.";
const TOO_LARGE = "That photo is too large.";
const PAUSED = "Scanning is paused right now. You can still type your answer.";

const upload = z.strictObject({
  file: z.instanceof(File).refine((file) => file.size > 0, BAD_TYPE),
});

/** The claimed type must match the file's own signature. */
function sniff(bytes: Uint8Array, mime: string) {
  const starts = (sig: number[], at = 0) =>
    sig.every((byte, i) => bytes[at + i] === byte);
  if (mime === "image/jpeg") return starts([0xff, 0xd8, 0xff]);
  if (mime === "image/png")
    return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/webp")
    return (
      starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)
    );
  return false;
}

/** Photo in, typed text out. Writes nothing to attempts; the client saves the text as answer_text. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Unauthorised");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail(404, "Attempt not found");

  const { data: row } = await supabase
    .from("attempts")
    .select(
      "status, image_paths, question:questions(type,stem), session:sessions(kind,config,finished_at)",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const attempt = row as unknown as {
    status: string;
    image_paths: string[] | null;
    question: { type: string; stem: string } | null;
    session: {
      kind: string;
      config: { feedback?: string } | null;
      finished_at: string | null;
    } | null;
  } | null;
  if (
    !attempt ||
    attempt.session?.kind !== "sprint" ||
    !attempt.question ||
    attempt.question.type === "mcq"
  )
    return fail(404, "Attempt not found");
  if (
    attempt.session.finished_at ||
    (attempt.session.config?.feedback === "each" &&
      !["pending", "transcribed"].includes(attempt.status)) ||
    attempt.image_paths?.length
  )
    return fail(409, "This answer can't be edited any more");

  // Reject oversized bodies before buffering them.
  const declared = Number(request.headers.get("content-length"));
  if (declared > SCAN_PHOTO_BYTE_LIMIT + 64 * 1024) return fail(413, TOO_LARGE);
  const form = await request.formData().catch(() => null);
  const parsed = upload.safeParse(
    form && form.getAll("file").length === 1 && [...form.keys()].length === 1
      ? { file: form.get("file") }
      : null,
  );
  if (!parsed.success) return fail(400, BAD_TYPE);
  const { file } = parsed.data;
  if (file.size > SCAN_PHOTO_BYTE_LIMIT) return fail(413, TOO_LARGE);
  const bytes = await file.arrayBuffer();
  if (!sniff(new Uint8Array(bytes), file.type)) return fail(400, BAD_TYPE);

  const limited = await assertStudentAiRateLimit({ userId: user.id });
  if (!limited.ok) return rateLimitedResponse(limited);
  try {
    return await withAiUsageReservation(limited, async () => {
      const { data: spent, error: spendError } = await admin().rpc("ai_spend");
      // Unknown spend counts as over budget.
      if (spendError || !(Number(spent) < BUDGET_USD)) return fail(503, PAUSED);
      const result = await withAttemptUsage(id, () =>
        transcribeImage(bytes, file.type, attempt.question!.stem, user.id, {
          task: SCAN_TASK,
          detail: "high",
        }),
      );
      const text = capWords(result.transcript.trim());
      if (!text)
        return fail(422, "We couldn't read any writing in that photo.", {
          unreadable: true,
        });
      return Response.json({
        text,
        uncertain: text.match(/\[\?\]/g)?.length ?? 0,
        notes: result.notes,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AI budget reached")
      return fail(503, PAUSED);
    console.error(
      "scan failed",
      error instanceof Error ? error.message : error,
    );
    return fail(500, "Couldn't read your photo. Try again.");
  }
}
