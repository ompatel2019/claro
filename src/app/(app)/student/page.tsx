import { Suspense } from "react";
import { pageMetadata } from "@/lib/page-metadata";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { needsWelcome } from "@/lib/welcome";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "@/lib/flashcards";
import { type ActivityDay } from "@/lib/activity";
import {
  greeting,
  longDate,
  practiceWeek,
  schoolWeek,
  studyQuote,
} from "@/lib/home";
import {
  HomeRecent,
  HomeNextStep,
  HomeWeek,
  readHomeSessions,
} from "@/components/student/home/sections";
import { PageHeader } from "@/components/claro/layout";
import { Shortcut } from "@/components/shortcut";
import { Card } from "@/components/ui/card";
import { loadProgress } from "@/lib/progress-data";
import { examDaysLeft, HSC_EXAM } from "@/lib/hsc-exam";
export const metadata = pageMetadata("Home");

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
  const weekDays = practiceWeek(today, []);
  const activity = createClient()
    .then(async (db) => {
      const { data, error } = await db.rpc("activity_days", {
        p_from: weekDays[0].day,
        p_to: today,
      });
      if (error) throw error;
      return (data ?? []) as ActivityDay[];
    })
    .catch(() => null);
  const progress = loadProgress("30", today).catch(() => null);
  const sessions = readHomeSessions(id);
  const week = schoolWeek(today);
  return (
    <div className="min-w-0 space-y-6" data-testid="student-home">
      {showWelcome && <WelcomeDialog profile={profile} />}
      {!showWelcome && <Shortcut k="s" href="/student/sprint" />}
      <PageHeader
        eyebrow={
          <>
            {longDate()} ·{" "}
            {week
              ? `Term ${week.term}, week ${week.week}`
              : "NSW school holidays"}
            {examDaysLeft(today) !== null && (
              <span className="md:hidden">
                {" "}
                · {HSC_EXAM.name} in {examDaysLeft(today)} days
              </span>
            )}
          </>
        }
        title={`${greeting()}${first ? `, ${first}` : ""}`}
        actions={
          <p className="text-muted-foreground max-w-[40ch] text-[13px] leading-[18px]">
            {studyQuote(today)}
          </p>
        }
      />
      <Suspense fallback={<Card aria-hidden className="h-64 animate-pulse" />}>
        <HomeNextStep progress={progress} sessions={sessions} />
      </Suspense>
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Suspense
          fallback={<Card aria-hidden className="h-72 animate-pulse" />}
        >
          <HomeRecent sessions={sessions} today={today} />
        </Suspense>
        <Suspense
          fallback={<Card aria-hidden className="h-72 animate-pulse" />}
        >
          <HomeWeek today={today} activity={activity} progress={progress} />
        </Suspense>
      </div>
    </div>
  );
}
