import { studentMarking } from "@/lib/feedback";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await db
    .from("attempts")
    .select("status, mark, max_marks, band, feedback")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error)
    return Response.json({ error: "Could not load attempt" }, { status: 500 });
  if (!data)
    return Response.json({ error: "Attempt not found" }, { status: 404 });
  return Response.json(studentMarking(data), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
