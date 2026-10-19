import { pageMetadata } from "@/lib/page-metadata";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { needsWelcome } from "@/lib/welcome";
import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Cards,
  Flame,
  History,
  Pen,
  Sprint,
} from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "@/lib/flashcards";
import { addDays, type ActivityDay } from "@/lib/activity";
import { greeting, longDate, schoolWeek, dailyQuote } from "@/lib/home";
import type { Topic } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { FlashcardStart } from "@/components/flashcard-start";
import { PageHeader } from "@/components/page-header";
import { Shortcut } from "@/components/shortcut";
import { TryAgain } from "@/components/try-again";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = pageMetadata("Home");

/** Live flashcards due today, or null when the count can't be read. */
async function dueCount(userId: string) {
  const db = await createClient();
  const { count, error } = await db
    .from("flashcard_progress")
    .select("flashcard_id,flashcards!inner(id)", { count: "exact", head: true })
    .eq("flashcards.status", "live")
    .eq("user_id", userId)
    .lte("due_on", sydneyToday());
  return error ? null : (count ?? 0);
}

async function DueCount({ due }: { due: Promise<number | null> }) {
  const count = await due;
  return <>{count === null ? "Choose a deck" : `${count} due`}</>;
}

function Hero({ today }: { today: string }) {
  const week = schoolWeek(today);
  return (
    <section
      aria-label="Your study week"
      className="relative overflow-hidden rounded-2xl bg-[#1e223d] px-5 py-5 text-white sm:px-8 sm:py-6"
    >
      <div
        aria-hidden
        className="bg-brand absolute -top-10 -right-16 h-[200%] w-40 rotate-[24deg] opacity-90 sm:right-10"
      />
      <div
        aria-hidden
        className="bg-brand/40 absolute -top-10 right-24 hidden h-[200%] w-10 rotate-[24deg] sm:right-56 sm:block"
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[#f99576] uppercase">
            {week ? `Term ${week.term}` : "NSW school holidays"}
          </p>
          <h2 className="text-4xl leading-none font-bold tracking-tight sm:text-5xl">
            {week ? `Week ${week.week}` : "Holiday mode"}
          </h2>
        </div>
        <p className="text-lg font-semibold text-white/90 sm:mr-56 sm:text-xl">
          {dailyQuote(today)}
        </p>
      </div>
      {week && (
        <ol
          aria-label={`Week ${week.week} of ${week.weeks}`}
          className="relative mt-4 flex gap-1.5"
        >
          {Array.from({ length: week.weeks }, (_, i) => (
            <li
              key={i}
              className={cn(
                "h-1.5 rounded-full",
                i + 1 === week.week ? "bg-brand w-6" : "w-3",
                i + 1 < week.week && "bg-white/80",
                i + 1 > week.week && "bg-white/25",
              )}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

async function StudyDays({
  today,
  due,
}: {
  today: string;
  due: Promise<number | null>;
}) {
  const db = await createClient();
  const [days, streaks, dueNow] = await Promise.all([
    db.rpc("activity_days", { p_from: addDays(today, -371), p_to: today }),
    db.rpc("activity_streaks").single(),
    due,
  ]);
  const streak = streaks.data as {
    current_streak: number;
    longest_streak: number;
  } | null;
  const action = dueNow ? (
    <FlashcardStart due label="Light up today" />
  ) : (
    <Link href="/student/sprint" className={buttonVariants()}>
      <Flame /> Light up today
    </Link>
  );
  return (
    <ActivityHeatmap
      days={(days.data ?? []) as ActivityDay[]}
      today={today}
      current={streak?.current_streak ?? 0}
      longest={streak?.longest_streak ?? 0}
      error={!!days.error || !!streaks.error || !streak}
      errorContent={<TryAgain what="your study days" />}
      home={{ action }}
    />
  );
}

async function StudyHub() {
  const db = await createClient();
  const { data, error } = await db
    .from("topics")
    .select("id,parent_id,name,sort")
    .order("sort");
  const topics = ((data ?? []) as Topic[]).filter((t) => !t.parent_id);
  return (
    <section aria-labelledby="study-hub" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="study-hub" className="text-base">
          Study hub
        </h2>
        <Link
          href="/student/sprint"
          className="text-sm font-semibold underline underline-offset-4"
        >
          All topics
        </Link>
      </div>
      {error ? (
        <TryAgain what="your topics" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {topics.map((t, i) => (
            <li key={t.id}>
              <Link
                href={`/student/sprint?topics=${encodeURIComponent(t.id)}`}
                className="bg-accent hover:border-brand focus-visible:ring-ring flex h-full min-h-20 items-start gap-3 rounded-xl border p-3 outline-none focus-visible:ring-2"
              >
                <span className="text-brand text-3xl leading-none font-bold">
                  {i + 1}
                </span>
                <span className="text-sm leading-snug font-semibold">
                  {t.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function Home() {
  const profile = await requireProfile();
  const first = profile.full_name?.trim().split(/\s+/)[0];
  const id = profile.id;
  let sessionCount: number | null = null;
  if (profile.role === "student" && profile.year_level === null) {
    const db = await createClient();
    const { count, error } = await db
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .in("kind", ["sprint", "flashcards", "single"])
      .eq("user_id", id);
    if (error) throw new Error("Couldn't check first visit.");
    sessionCount = count;
  }
  const showWelcome = needsWelcome(profile, sessionCount);
  const today = sydneyToday();
  const due = dueCount(id).catch(() => null);
  const tiles = [
    {
      title: "Topic Sprint",
      href: "/student/sprint",
      icon: Sprint,
      copy: "Practise a topic",
    },
    {
      title: "Flashcards",
      href: "/student/flashcards",
      icon: Cards,
      copy: (
        <Suspense fallback="Choose a deck">
          <DueCount due={due} />
        </Suspense>
      ),
    },
    {
      title: "Mark my answer",
      href: "/student/mark",
      icon: Pen,
      copy: "Get feedback on your writing",
    },
    {
      title: "Activity",
      href: "/student/activity",
      icon: History,
      copy: "Your sessions and results",
    },
  ];
  return (
    <div className="space-y-4" data-testid="student-home">
      {showWelcome && <WelcomeDialog profile={profile} />}
      {!showWelcome && <Shortcut k="s" href="/student/sprint" />}
      <PageHeader
        eyebrow={longDate()}
        title={`${greeting()}${first ? `, ${first}` : ""}`}
      />
      <Hero today={today} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Quick start" className="grid grid-cols-2 gap-3">
          {tiles.map(({ title, href, icon: Icon, copy }) => (
            <Link
              key={href}
              href={href}
              className="bg-card hover:border-brand focus-visible:ring-ring group relative flex min-h-32 min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-2xl border p-4 outline-none focus-visible:ring-2 sm:min-h-36 sm:p-5"
            >
              <Icon
                aria-hidden
                className="text-brand/10 absolute -right-4 -bottom-4 size-28"
              />
              <span className="bg-accent text-brand grid size-11 place-items-center rounded-xl">
                <Icon className="size-6" />
              </span>
              <ArrowUpRight
                aria-hidden
                className="text-muted-foreground group-hover:text-brand absolute top-4 right-4 size-5"
              />
              <div className="relative">
                <h2 className="text-base sm:text-lg">{title}</h2>
                <p className="text-muted-foreground text-xs sm:text-sm">
                  {copy}
                </p>
              </div>
            </Link>
          ))}
        </section>
        <Suspense
          fallback={<Card aria-hidden className="h-72 animate-pulse" />}
        >
          <StudyDays today={today} due={due} />
        </Suspense>
      </div>
      <Suspense fallback={<Card aria-hidden className="h-28 animate-pulse" />}>
        <StudyHub />
      </Suspense>
    </div>
  );
}
