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
import { greeting, longDate, schoolWeek } from "@/lib/home";
import type { Topic } from "@/lib/practice";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { FlashcardStart } from "@/components/flashcard-start";
import { PageHeader, TermProgress } from "@/components/claro/layout";
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
  return count === null ? (
    <>Choose a deck</>
  ) : (
    <>
      <span className="text-[30px] leading-none font-bold tracking-[-0.035em] tabular-nums">
        {count}
      </span>{" "}
      <span className="text-muted-foreground text-xs font-normal">due</span>
    </>
  );
}

function Hero({ today }: { today: string }) {
  const week = schoolWeek(today);
  return (
    <section aria-label="Your study week" className="hidden md:block">
      {week ? (
        <TermProgress term={week.term} week={week.week} weeks={week.weeks} />
      ) : (
        <span className="text-muted-foreground text-[13px]">
          NSW school holidays
        </span>
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
    <Card className="h-full gap-4">
      <section aria-label="Study hub" className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 px-5">
          <div>
            <h2 id="study-hub" className="text-[15px] font-semibold">
              Topics
            </h2>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Choose a topic for your next sprint.
            </p>
          </div>
          <Link
            href="/student/sprint"
            className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1 text-xs"
          >
            All topics <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </div>
        {error ? (
          <div className="px-5 pt-4">
            <TryAgain what="your topics" />
          </div>
        ) : (
          <ul className="divide-border/70 mt-4 divide-y px-3">
            {topics.map((t, i) => (
              <li key={t.id}>
                <Link
                  href={`/student/sprint?topics=${encodeURIComponent(t.id)}`}
                  className="hover:bg-accent focus-visible:ring-ring flex min-h-[68px] items-center gap-3 rounded-lg px-2 py-3.5 outline-none focus-visible:ring-2"
                >
                  <span className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold">
                    {t.name}
                  </span>
                  <span
                    className="bg-card shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium shadow-xs"
                    aria-hidden
                  >
                    Practise
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
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
    <div className="min-w-0 space-y-5" data-testid="student-home">
      {showWelcome && <WelcomeDialog profile={profile} />}
      {!showWelcome && <Shortcut k="s" href="/student/sprint" />}
      <PageHeader
        eyebrow={longDate()}
        title={`${greeting()}${first ? `, ${first}` : ""}`}
        actions={
          <>
            <Hero today={today} />
            <Link
              href="/student/flashcards"
              className={buttonVariants({ variant: "outline" })}
            >
              <Cards aria-hidden />
              Review cards
            </Link>
            <Link href="/student/sprint" className={buttonVariants()}>
              <Sprint aria-hidden />
              Start sprint
            </Link>
          </>
        }
      />
      <section
        aria-label="Quick start"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5"
      >
        {tiles.map(({ title, href, icon: Icon, copy }) => (
          <Link
            key={href}
            href={href}
            className="bg-card shadow-card hover:border-foreground/20 focus-visible:ring-ring group flex min-h-[152px] min-w-0 flex-col justify-between gap-4 rounded-xl border p-5 outline-none focus-visible:ring-2"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-muted-foreground text-[13px] font-medium">
                {title}
              </h2>
              <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
                <Icon aria-hidden className="size-4" />
              </span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <p className="text-[15px] font-semibold">{copy}</p>
              <ArrowUpRight
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
            </div>
          </Link>
        ))}
      </section>
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2.06fr)_minmax(0,1fr)] xl:gap-5">
        <Suspense
          fallback={<Card aria-hidden className="h-80 animate-pulse" />}
        >
          <StudyHub />
        </Suspense>
        <Suspense
          fallback={<Card aria-hidden className="h-80 animate-pulse" />}
        >
          <StudyDays today={today} due={due} />
        </Suspense>
      </div>
    </div>
  );
}
