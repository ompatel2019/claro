import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { disputeNoteSchema } from "@/lib/disputes";

/** Caps, ownership and state change are enforced atomically by the authenticated RPC. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = disputeNoteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Tell us what we missed in 10 to 1,000 characters." },
      { status: 400 },
    );
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Attempt not found" }, { status: 404 });
  const { data, error } = await supabase.rpc("request_mark_review", {
    p_attempt: id,
    p_note: parsed.data.note,
  });
  if (error)
    return Response.json(
      { error: "Couldn't request a review. Try again." },
      { status: 503 },
    );
  return Response.json(data, { status: data.status ?? 200 });
}
