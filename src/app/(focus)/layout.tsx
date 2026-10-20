import { Toaster } from "sonner";
import { requireProfile } from "@/lib/auth";
import { FeedbackWidget } from "@/components/feedback-widget";
import { FlashcardPersistDrain } from "@/components/flashcard-persist-drain";
export default async function FocusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  return (
    <FeedbackWidget userId={profile.id}>
      <FlashcardPersistDrain />
      {children}
      <Toaster position="top-center" />
    </FeedbackWidget>
  );
}
