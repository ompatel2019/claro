import { pageMetadata } from "@/lib/page-metadata";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { needsWelcome } from "@/lib/welcome";
import { Suspense } from "react";
import Link from "next/link";
import { Cards, Flame, Sprint } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "@/lib/flashcards";
import { addDays, type ActivityDay } from "@/lib/activity";
import { greeting, longDate, schoolWeek } from "@/lib/home";
import { loadProgress } from "@/lib/progress-data";
import {
  HomeStats,
  HomeAverage,
  HomeTopics,
  HomePlan,
  HomeRecent,
  HomeLostMarks,
  readHomeSessions,
  readHomeUnfinishedSprint,
} from "@/components/student/home/sections";
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
      home={{ action, template: true }}
    />
  );
}

async function SafeStudyDays(props: Parameters<typeof StudyDays>[0]) {
  try {
    return await StudyDays(props);
  } catch {
    return (
      <Card className="p-5">
        <TryAgain what="your study days" />
      </Card>
    );
  }
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
  const progress = loadProgress("90", today).catch(() => null);
  const sessions = readHomeSessions(id);
  const unfinished = readHomeUnfinishedSprint(id);
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
      <Suspense fallback={<Card aria-hidden className="h-40 animate-pulse" />}>
        <HomeStats progress={progress} due={due} />
      </Suspense>
      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,2.06fr)_minmax(0,1fr)]">
        <Suspense
          fallback={<Card aria-hidden className="h-96 animate-pulse" />}
        >
          <HomeAverage progress={progress} today={today} />
        </Suspense>
        <Suspense
          fallback={<Card aria-hidden className="h-96 animate-pulse" />}
        >
          <HomePlan
            progress={progress}
            sessions={sessions}
            unfinished={unfinished}
            due={due}
          />
        </Suspense>
      </div>
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2.06fr)_minmax(0,1fr)] xl:gap-5">
        <Suspense
          fallback={<Card aria-hidden className="h-80 animate-pulse" />}
        >
          <HomeTopics progress={progress} />
        </Suspense>
        <Suspense
          fallback={<Card aria-hidden className="h-80 animate-pulse" />}
        >
          <SafeStudyDays today={today} due={due} />
        </Suspense>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Suspense
          fallback={<Card aria-hidden className="h-80 animate-pulse" />}
        >
          <HomeLostMarks progress={progress} />
        </Suspense>
        <Suspense
          fallback={<Card aria-hidden className="h-80 animate-pulse" />}
        >
          <HomeRecent sessions={sessions} progress={progress} />
        </Suspense>
      </div>
    </div>
  );
}
