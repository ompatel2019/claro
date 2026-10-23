import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadFlashcards, pages } from "@/lib/flashcard-data";
import {
  firstReviews,
  type FlashcardProgress,
  type FlashcardReview,
} from "@/lib/flashcards";
import { createClient } from "@/utils/supabase/server";
import { dateLabel, timer, topicNames } from "@/lib/practice";
import { FlashcardRunner } from "@/components/flashcard-runner";
import { finishOpenSessions, sessionIdle } from "@/lib/session-finish";
import { FlashcardStart } from "@/components/flashcard-start";
import { PageHeader } from "@/components/claro/layout";
import { StatCard } from "@/components/claro/data-display";
import { Check, Minus, Close } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export const metadata = pageMetadata("Flashcard session");

export default async function FlashcardSession({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, cards, reviews, topics, profile } = await loadFlashcards(id);
  const deckName =
    session.config.which === "due" || session.config.due
      ? "Due for review"
      : topicNames(
          session.config.subtopics?.length
            ? session.config.subtopics
            : session.config.topics,
          topics,
        );
  // No resume: a deck idle for 30 minutes is finished and shows its results.
  if (
    !session.finished_at &&
    sessionIdle((session as { last_active_at?: string }).last_active_at)
  ) {
    if (!(await finishOpenSessions(profile.id, { only: id })))
      throw new Error("Couldn't end this deck. Try again.");
    redirect(`/student/flashcards/${id}`);
  }
  if (!session.finished_at)
    return (
      <FlashcardRunner
        session={session}
        cards={cards}
        reviews={reviews}
        topics={topics}
        deckName={deckName}
      />
    );
  const first = firstReviews(reviews);
  const rows = session.config.card_ids.flatMap((cardId) => {
    const card = cards.find((c) => c.id === cardId);
    return card ? [{ card, review: first.get(cardId) }] : [];
  });
  const missed = rows.filter((r) => r.review && r.review.mark < 1);
  const counts = [1, 0.5, 0].map(
    (mark) => rows.filter((r) => r.review?.mark === mark).length,
  );
  const db = await createClient();
  const [progressResult, history] = await Promise.all([
    db
      .from("flashcard_progress")
      .select("flashcard_id,due_on")
      .eq("user_id", profile.id)
      .in("flashcard_id", session.config.card_ids)
      .throwOnError(),
    pages<Pick<FlashcardReview, "flashcard_id" | "mark">>((from, to) =>
      db
        .from("flashcard_reviews")
        .select("flashcard_id,mark")
        .eq("user_id", profile.id)
        .in("flashcard_id", session.config.card_ids)
        .order("id")
        .range(from, to),
    ),
  ]);
  const progress = (progressResult.data ?? []) as Pick<
    FlashcardProgress,
    "flashcard_id" | "due_on"
  >[];
  return (
    <main
      id="main"
      className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6 sm:py-12"
    >
      <PageHeader
        eyebrow={`${deckName} · ${session.config.mode === "study" ? "Study" : "Test"}`}
        title="Your flashcard results"
      />
      <Card className="items-center gap-3 px-6 py-8 text-center">
        <span className="bg-success-soft text-success-text grid size-12 place-items-center rounded-full">
          <Check className="size-6" aria-hidden />
        </span>
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">Deck done</h2>
        <p className="text-muted-foreground text-sm">
          Cards you missed come back sooner. Cards you knew come back later.
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="First-try score"
          value={
            first.size
              ? `${counts[0]} / ${session.config.card_ids.length}`
              : "No score yet"
          }
        />
        <StatCard title="Knew / Mostly / Missed" value={counts.join(" / ")} />
        <StatCard title="Time" value={timer(session.elapsed_s ?? 0)} />
        <StatCard
          title="Repeats"
          value={Math.max(0, reviews.length - first.size)}
        />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <FlashcardStart
          cardIds={missed.map((r) => r.card.id)}
          label={`Practise missed (${missed.length})`}
          disabled={!missed.length}
        />
        {session.config.mode === "study" && (
          <FlashcardStart
            cardIds={session.config.card_ids}
            mode="test"
            label="Test these cards"
            variant="outline"
          />
        )}
        <FlashcardStart due label="Review due" variant="outline" />
        <Button variant="outline" render={<Link href="/student/flashcards" />}>
          Back to flashcards
        </Button>
      </div>
      <Card className="p-5">
        <h2 id="your-cards">Your cards</h2>
        <Table aria-labelledby="your-cards">
          <TableHeader>
            <TableRow>
              {[
                "Card",
                "Your answer",
                "Result",
                "Reason",
                "Model answer",
                "All-time",
                "Next due",
              ].map((label) => (
                <TableHead
                  key={label}
                  className={
                    label === "Reason" || label === "All-time"
                      ? "hidden sm:table-cell"
                      : undefined
                  }
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ card, review }) => {
              const all = history.filter((r) => r.flashcard_id === card.id);
              const due = progress.find(
                (p) => p.flashcard_id === card.id,
              )?.due_on;
              const Icon =
                review?.mark === 1
                  ? Check
                  : review?.mark === 0.5
                    ? Minus
                    : Close;
              return (
                <TableRow key={card.id}>
                  <TableCell>{card.front}</TableCell>
                  <TableCell className="whitespace-pre-wrap">
                    {review?.answer || "Not answered"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        !review
                          ? "outline"
                          : review.mark === 1
                            ? "success"
                            : review.mark === 0.5
                              ? "warning"
                              : "destructive"
                      }
                    >
                      <Icon />
                      {!review
                        ? "Not rated"
                        : review.mark === 1
                          ? "Knew it"
                          : review.mark === 0.5
                            ? "Mostly"
                            : "Missed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {review?.reason || (review ? "Self-rated" : "Skipped")}
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap">
                    {card.back}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    Seen {all.length}× ·{" "}
                    {all.length
                      ? Math.round(
                          (all.reduce((sum, r) => sum + r.mark, 0) /
                            all.length) *
                            100,
                        )
                      : 0}
                    % all-time
                  </TableCell>
                  <TableCell>{due ? dateLabel(due) : "Due now"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </main>
  );
}
