import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Cards, PortalIcon } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "@/lib/flashcards";
import { DECK_DEFAULTS, filterDeck, type DeckCard } from "@/lib/deck";
import { loadDeckBank } from "@/lib/flashcard-data";
import { dateLabel, plural, type Topic } from "@/lib/practice";
import { FlashcardStart } from "@/components/flashcard-start";
import { FlashcardBuilder } from "@/components/flashcard-builder";
import { PageHeader, EmptyState } from "@/components/claro/layout";
import { Meter } from "@/components/claro/data-display";
import { PenCaret } from "@/components/claro/markup-answer";
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
  const due = dueCards.length;
  const inTopic = (c: DeckCard, id: string) =>
    c.topic_id === id ||
    c.topic_id.startsWith(`${id}-`) ||
    topics.some((child) => child.id === c.topic_id && child.parent_id === id);
  const byTopic = topics
    .filter((t) => !t.parent_id)
    .map((t) => ({
      ...t,
      count: dueCards.filter((c) => inTopic(c, t.id)).length,
    }));
  const progressById = new Map(activeProgress.map((p) => [p.flashcard_id, p]));
  const known = (c: DeckCard) => {
    const p = progressById.get(c.id);
    return !!p && p.reviews > 0 && Number(p.last_mark) === 1;
  };
  const decks = byTopic.map((t) => {
    const deck = cards.filter((c) => inTopic(c, t.id));
    return { ...t, total: deck.length, known: deck.filter(known).length };
  });
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
      label: "Mastered",
      count: cards.filter(known).length,
      tone: "bg-chart-1",
    },
  ];
  const mine = ownCount.count ?? 0;
  const knownTotal = states[2].count;
  return (
    <div>
      <PageHeader
        title="Flashcards"
        eyebrow="Key terms for every topic, brought back just before you'd forget them"
        actions={
          <>
            <Link
              className={cn(buttonVariants({ variant: "outline" }))}
              href="#my-cards"
            >
              <PortalIcon name="layers" />
              My cards ({mine})
            </Link>
            <NewCard topics={topics} variant="outline" />
          </>
        }
      />
      <section className="home-next fc-due" aria-labelledby="due-title">
        <p className="text-ink-2 flex items-center gap-2 text-sm font-semibold">
          <PenCaret />
          Due today
        </p>
        <h2
          id="due-title"
          className="mt-2.5 text-2xl leading-8 font-[650] tracking-[-0.015em]"
        >
          {due ? `${plural(due, "card")} to review` : "Nothing due today"}
        </h2>
        <p className="text-ink-2 mt-2.5 max-w-[60ch]">
          {due
            ? `About ${plural(Math.max(1, Math.round(due * 0.33)), "minute")} · ${tomorrowCount} due tomorrow`
            : next
              ? `Nothing due. Next review ${dateLabel(next, true)}.`
              : "Nothing due. Start a deck below."}
        </p>
        {due > 0 && (
          <ul className="mt-3.5 flex flex-wrap gap-2" aria-label="Due by topic">
            {byTopic
              .filter((t) => t.count)
              .map((t) => (
                <li key={t.id} className="fc-fact">
                  {t.name} · <b>{t.count}</b>
                </li>
              ))}
          </ul>
        )}
        {(due > 0 || open) && (
          <div className="mt-5 flex flex-wrap items-start gap-3">
            {due > 0 && (
              <FlashcardStart
                due
                label="Review due cards"
                icon={null}
                trailing={
                  <PortalIcon name="arrow-right" size={20} strokeWidth={1.5} />
                }
                size="lg"
                className="home-primary"
              />
            )}
            {open && (
              <Link
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-12 bg-transparent shadow-none",
                )}
                href={`/student/flashcards/${open.id}`}
              >
                <Cards aria-hidden />
                Continue session · {reviewed} of {openIds.length} reviewed
              </Link>
            )}
          </div>
        )}
      </section>
      <section className="mt-7" aria-labelledby="decks-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="decks-title" className="text-lg leading-[26px] font-semibold">
            Topic decks
          </h2>
          <p className="text-muted-foreground text-[13px]">
            {plural(cards.length, "card")} · {knownTotal} known
          </p>
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {decks.map((d) => (
            <li key={d.id} className="fc-deck">
              <h3 className="font-semibold">{d.name}</h3>
              <p className="text-muted-foreground text-[13px]">
                {plural(d.total, "card")} · {d.count} due today
              </p>
              <Meter
                value={d.total ? (d.known / d.total) * 100 : 0}
                label={`${d.name}: ${d.known} of ${d.total} known`}
                className="h-2"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px]">
                  {d.known} of {d.total} known
                </p>
                <FlashcardStart
                  config={{ ...DECK_DEFAULTS, topics: [d.id] }}
                  disabled={!d.total}
                  label="Study deck"
                  variant="outline"
                  size="sm"
                  icon={<Cards aria-hidden />}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-5 flex max-w-[72ch] items-start gap-2 text-[13px] leading-[18px]">
          <PortalIcon
            name="circle-alert"
            size={16}
            strokeWidth={1.5}
            className="mt-px shrink-0"
          />
          Rate each card honestly. Missed cards come back later in the same
          session and again tomorrow, and the ones you know wait a little longer
          each time.
        </p>
      </section>
      <div className="mt-7 grid grid-cols-1 items-start gap-4 xl:grid-cols-3 xl:gap-5">
        <FlashcardBuilder
          cards={cards}
          defaults={{ ...DECK_DEFAULTS, kinds: ["term"] }}
          topics={topics}
          history={history}
          topic={params.topic}
        />
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
        <Card id="my-cards" className="scroll-mt-20 xl:col-span-2">
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
                  className={cn(buttonVariants({ variant: "outline" }))}
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
