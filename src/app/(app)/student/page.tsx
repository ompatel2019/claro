import { Suspense } from "react";
import Link from "next/link";
import { pageMetadata } from "@/lib/page-metadata";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { needsWelcome } from "@/lib/welcome";
import { PortalIcon } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "@/lib/flashcards";
import { addDays, type ActivityDay } from "@/lib/activity";
import { greeting, longDate, schoolWeek, studyQuote } from "@/lib/home";
import {
  HomeRecent,
  readHomeSessions,
} from "@/components/student/home/sections";
import { StudyChoice } from "@/components/student/home/study-choice";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { PageHeader, TermProgress } from "@/components/claro/layout";
import { Shortcut } from "@/components/shortcut";
import { TryAgain } from "@/components/try-again";
import { Card } from "@/components/ui/card";
export const metadata = pageMetadata("Home");

async function StudyDays({
  today,
  activity,
}: {
  today: string;
  activity: Promise<ActivityDay[] | null>;
}) {
  const db = await createClient();
  const [days, streaks] = await Promise.all([
    activity,
    db.rpc("activity_streaks").single(),
  ]);
  if (days === null) throw new Error("Couldn't load your study days.");
  const streak = streaks.data as {
    current_streak: number;
    longest_streak: number;
  } | null;
  const action = <StudyChoice />;
  return (
    <ActivityHeatmap
      days={days}
      today={today}
      current={streak?.current_streak ?? 0}
      longest={streak?.longest_streak ?? 0}
      error={!!streaks.error || !streak}
      errorContent={<TryAgain what="your study days" />}
      home={{ action }}
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
  const activity = createClient()
    .then(async (db) => {
      const { data, error } = await db.rpc("activity_days", {
        p_from: addDays(today, -371),
        p_to: today,
      });
      if (error) throw error;
      return (data ?? []) as ActivityDay[];
    })
    .catch(() => null);
  const sessions = readHomeSessions(id);
  const week = schoolWeek(today);
  return (
    <div className="min-w-0 space-y-5" data-testid="student-home">
      {showWelcome && <WelcomeDialog profile={profile} />}
      {!showWelcome && <Shortcut k="s" href="/student/sprint" />}
      <PageHeader
        eyebrow={longDate()}
        title={`${greeting()}${first ? `, ${first}` : ""}`}
      />
      <Card
        className="gap-3 p-5 md:flex-row md:items-center md:justify-between"
        aria-label="Your study week"
      >
        <section aria-label="Your study week">
          {week ? (
            <TermProgress
              term={week.term}
              week={week.week}
              weeks={week.weeks}
            />
          ) : (
            <p className="text-sm font-medium">NSW school holidays</p>
          )}
        </section>
        <p className="text-muted-foreground text-sm">{studyQuote(today)}</p>
      </Card>
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 md:grid-cols-2">
        <section
          aria-label="Quick start"
          className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {[
            {
              title: "Topic Sprint",
              description: "Choose a topic and practise HSC questions.",
              href: "/student/sprint",
              icon: "zap" as const,
              action: "Start a sprint",
            },
            {
              title: "Flashcards",
              description: "Build recall, one concept at a time.",
              href: "/student/flashcards",
              icon: "copy" as const,
              action: "Choose your cards",
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-card shadow-card hover:bg-accent focus-visible:outline-ring flex min-h-44 flex-col items-start gap-3 rounded-2xl border p-5 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="text-brand">
                <PortalIcon name={item.icon} />
              </span>
              <div>
                <h2 className="text-xl font-semibold">{item.title}</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {item.description}
                </p>
              </div>
              <span className="mt-auto flex items-center gap-2 text-sm font-semibold">
                {item.action}
                <PortalIcon name="arrow-right" className="size-4" />
              </span>
            </Link>
          ))}
        </section>
        <div className="min-w-0 md:col-start-2 md:row-span-2 md:row-start-1">
          <Suspense
            fallback={<Card aria-hidden className="h-80 animate-pulse" />}
          >
            <SafeStudyDays today={today} activity={activity} />
          </Suspense>
        </div>
        <div className="min-w-0 md:col-start-1">
          <Suspense
            fallback={<Card aria-hidden className="h-80 animate-pulse" />}
          >
            <HomeRecent sessions={sessions} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
