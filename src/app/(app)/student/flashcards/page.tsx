import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { Cards, PortalIcon } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "@/lib/flashcards";
import { DECK_DEFAULTS, filterDeck } from "@/lib/deck";
import { loadDeckBank } from "@/lib/flashcard-data";
import { dateLabel, plural, type Topic } from "@/lib/practice";
import { FlashcardStart } from "@/components/flashcard-start";
import { FlashcardBuilder } from "@/components/flashcard-builder";
import { PageHeader, EmptyState } from "@/components/claro/layout";
import { Meter } from "@/components/claro/data-display";
import { NewCard } from "@/components/student/flashcards/new-card";
import { buttonVariants } from "@/components/ui/button";
import { addDays } from "@/lib/activity";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const metadata = pageMetadata("Flashcards");

export default async function Flashcards({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const db = await createClient();
  const [topicResult, bank, unfinished, ownCount] = await Promise.all([
    db
      .from("topics")
      .select("id,parent_id,name,sort")
      .order("sort")
      .throwOnError(),
    loadDeckBank(db, profile.id),
    db
      .from("sessions")
      .select("id,config")
      .eq("user_id", profile.id)
      .eq("kind", "flashcards")
      .is("finished_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .throwOnError(),
    db
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", profile.id)
      .eq("status", "live")
      .throwOnError(),
  ]);
  const { cards, progress } = bank;
  const today = sydneyToday();
  const tomorrow = addDays(today, 1);
  const history = { progress, today, userId: profile.id };
  const due = filterDeck(
    cards,
    { ...DECK_DEFAULTS, which: "due" },
    history,
  ).length;
  const ids = new Set(cards.map((c) => c.id));
  const activeProgress = progress.filter((p) => ids.has(p.flashcard_id));
  const tomorrowCount = activeProgress.filter(
    (p) => p.due_on === tomorrow,
  ).length;
  const next = activeProgress
    .filter((p) => p.due_on > today)
    .map((p) => p.due_on)
    .sort()[0];
  const open = unfinished.data?.[0];
  const openIds: string[] = open?.config.card_ids ?? [];
  const sessionReviews = open
    ? await db
        .from("flashcard_reviews")
        .select("flashcard_id")
        .eq("user_id", profile.id)
        .eq("session_id", open.id)
        .throwOnError()
    : null;
  const reviewed = new Set(
    (sessionReviews?.data ?? [])
      .filter((r) => openIds.includes(r.flashcard_id))
      .map((r) => r.flashcard_id),
  ).size;
  const topics = (topicResult.data ?? []) as Topic[];
  const dueCards = filterDeck(
    cards,
    { ...DECK_DEFAULTS, which: "due" },
    history,
  );
  const byTopic = topics
    .filter((t) => !t.parent_id)
    .map((t) => ({
      ...t,
      count: dueCards.filter(
        (c) => c.topic_id === t.id || c.topic_id.startsWith(`${t.id}-`),
      ).length,
    }));
  const maxDue = Math.max(1, ...byTopic.map((t) => t.count));
  const progressById = new Map(activeProgress.map((p) => [p.flashcard_id, p]));
  const states = [
    {
      label: "New",
      count: cards.filter((c) => !progressById.get(c.id)?.reviews).length,
      tone: "bg-chart-1/25",
    },
    {
      label: "Learning",
      count: cards.filter((c) => {
        const p = progressById.get(c.id);
        return p && p.reviews > 0 && Number(p.last_mark) < 1;
      }).length,
      tone: "bg-chart-1/55",
    },
    {
      label: "Known",
      count: cards.filter((c) => {
        const p = progressById.get(c.id);
        return p && p.reviews > 0 && Number(p.last_mark) === 1;
      }).length,
      tone: "bg-chart-1",
    },
  ];
  const mine = ownCount.count ?? 0;
  return (
    <div>
      <PageHeader
        title="Flashcards"
        description="Build the exact deck you want to drill."
        actions={
          <>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/student/flashcards/mine"
            >
              <PortalIcon name="layers" />
              My cards ({mine})
            </Link>
            <NewCard topics={topics} />
          </>
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3 xl:gap-5">
        <Card className="h-full xl:col-span-2">
          <CardContent className="grid gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-8">
            <div className="flex flex-col">
              <p className="text-muted-foreground text-[13px] font-medium">
                Due today
              </p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-[48px] leading-none font-bold tracking-[-0.045em]">
                  {due}
                </span>
                <span className="text-muted-foreground">cards</span>
              </p>
              <p className="text-muted-foreground mt-2 text-[13px]">
                {due
                  ? `About ${plural(Math.max(1, Math.round(due / 3)), "minute")} · ${tomorrowCount} due tomorrow`
                  : next
                    ? `Nothing due. Next review ${dateLabel(next, true)}.`
                    : "Nothing due. Start a deck below."}
              </p>
              {due > 0 && (
                <div className="mt-5 md:mt-auto md:pt-5">
                  <FlashcardStart due label="Review due cards" />
                </div>
              )}
            </div>
            <div>
              <p className="text-muted-foreground mb-3 text-[13px] font-medium">
                Due by topic
              </p>
              <ul className="grid gap-3">
                {byTopic.map((t) => (
                  <li key={t.id} className="grid gap-1.5">
                    <div className="flex justify-between gap-3 text-[13px]">
                      <span>{t.name}</span>
                      <span className="font-semibold tabular-nums">
                        {t.count}
                      </span>
                    </div>
                    <Meter
                      value={(t.count / maxDue) * 100}
                      label={`${t.name}: ${t.count} due`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
          {open && (
            <div className="bg-muted mx-5 flex items-center gap-3 rounded-xl px-3.5 py-3">
              <span className="bg-card text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
                <Cards className="size-4" aria-hidden />
              </span>
              <p className="min-w-0 flex-1 text-[13px]">
                <span className="font-semibold">Unfinished session</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {reviewed} of {openIds.length} reviewed
                </span>
              </p>
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={`/student/flashcards/${open.id}`}
              >
                Continue
              </Link>
            </div>
          )}
        </Card>
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Card library</CardTitle>
            <CardDescription>
              {cards.filter((c) => c.owner_id === null).length} Claro cards and{" "}
              {mine} of your own
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <div
              className="flex h-3 gap-0.5 overflow-hidden rounded-full"
              role="img"
              aria-label={states.map((s) => `${s.label} ${s.count}`).join(", ")}
            >
              {states.map((s) => (
                <span
                  key={s.label}
                  className={s.tone}
                  style={{
                    width: `${cards.length ? (s.count / cards.length) * 100 : 0}%`,
                  }}
                />
              ))}
            </div>
            <ul className="mt-4 grid gap-2.5 text-[13px]">
              {states.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5">
                  <span className={`size-2.5 rounded-[3px] ${s.tone}`} />
                  <span className="flex-1">{s.label}</span>
                  <span className="font-semibold tabular-nums">{s.count}</span>
                  <span className="text-muted-foreground w-10 text-right">
                    {cards.length
                      ? Math.round((s.count / cards.length) * 100)
                      : 0}
                    %
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-6 grid grid-cols-3 gap-3 border-t pt-4 text-[13px] xl:mt-auto">
              {[
                ["Terms", cards.filter((c) => c.kind === "term").length],
                ["Stats", cards.filter((c) => c.kind === "stat").length],
                ["Yours", mine],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <FlashcardBuilder
          cards={cards}
          topics={topics}
          history={history}
          topic={params.topic}
        />
        <Card id="my-cards" className="scroll-mt-20 xl:col-span-3">
          <CardHeader className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>My cards</CardTitle>
              <CardDescription className="mt-1">
                Cards you write join every deck you build.
              </CardDescription>
            </div>
            <NewCard topics={topics} variant="outline" size="sm" />
          </CardHeader>
          <CardContent>
            {mine === 0 ? (
              <EmptyState
                title="You haven’t made any cards yet"
                description="Make a card for any term you keep forgetting. Writing it yourself is half the learning."
                action={
                  <NewCard
                    topics={topics}
                    variant="outline"
                    size="sm"
                    label="Make your first card"
                  />
                }
              />
            ) : (
              <div className="rounded-xl border p-5">
                <p className="mb-3">
                  {mine} of your own cards, ready to join your decks.
                </p>
                <Link
                  href="/student/flashcards/mine"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Manage my cards
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
