import { examDaysLeft } from "@/lib/hsc-exam";
import { cookies } from "next/headers";
import { requireProfile } from "@/lib/auth";
import { sydneyToday } from "@/lib/flashcards";
import { createClient } from "@/utils/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";
import { FeedbackWidget } from "@/components/feedback-widget";
import { FlashcardPersistDrain } from "@/components/flashcard-persist-drain";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const db = await createClient();
  const [{ count }, jar] = await Promise.all([
    db
      .from("flashcard_progress")
      .select("flashcard_id,flashcards!inner(id)", {
        count: "exact",
        head: true,
      })
      .eq("flashcards.status", "live")
      .eq("user_id", profile.id)
      .lte("due_on", sydneyToday()),
    cookies(),
  ]);
  return (
    <FeedbackWidget userId={profile.id} floating={false}>
      <AppShell
        kind="student"
        examDays={examDaysLeft(sydneyToday())}
        name={profile.full_name}
        badges={{ "/student/flashcards": count ?? 0 }}
        defaultOpen={jar.get("sidebar_state")?.value !== "false"}
      >
        <FlashcardPersistDrain />
        {children}
        <Toaster position="bottom-center" />
      </AppShell>
    </FeedbackWidget>
  );
}
