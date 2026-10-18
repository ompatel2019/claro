import { pageMetadata } from "@/lib/page-metadata";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { needsWelcome } from "@/lib/welcome";
import { sessionTitle, sessionHref } from "@/lib/session-summary";
import { Suspense } from "react";
import Link from "next/link";
import { Cards, Sprint, Pen, History, Flame, Target } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { sydneyToday } from "@/lib/flashcards";
import {
  continueTime,
  greeting,
  longDate,
  schoolWeek,
  dailyQuote,
} from "@/lib/home";
import {
  answered,
  plural,
  timeLimit,
  type Session,
  type Topic,
} from "@/lib/practice";
import { PageHeader } from "@/components/page-header";
import { Shortcut } from "@/components/shortcut";
import { TryAgain } from "@/components/try-again";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <Card className="gap-2 p-3 sm:p-4">
    <h2 className="text-sm">{title}</h2>
    {children}
  </Card>
);
const KIND_ICON = { sprint: Sprint, flashcards: Cards, single: Pen };
const load = {
  topics: async () => {
    const db = await createClient();
    const { data, error } = await db
      .from("topics")
      .select("id,parent_id,name,sort")
      .order("sort");
    if (error) throw new Error("topics");
    return data as Topic[];
  },
};
async function DueCount({ userId }: { userId: string }) {
  const db = await createClient();
  const { count, error } = await db
    .from("flashcard_progress")
    .select("flashcard_id,flashcards!inner(id)", { count: "exact", head: true })
    .eq("flashcards.status", "live")
    .eq("user_id", userId)
    .lte("due_on", sydneyToday());
  return <span>{error ? "Choose a deck" : `${count ?? 0} due`}</span>;
}
async function Streak() {
  const db = await createClient();
  const { data, error } = await db.rpc("activity_streaks").single();
  const streak = data as {
    current_streak: number;
    longest_streak: number;
  } | null;
  return (
    <Card className="flex-row items-center gap-3 p-3 sm:p-4">
      <Flame className="text-brand size-6 shrink-0" />
      {error || !streak ? (
        <TryAgain what="your streak" />
      ) : (
        <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p>
            <strong>{plural(streak.current_streak, "day")}</strong> streak
          </p>
          <p className="text-muted-foreground text-xs">
            Longest {plural(streak.longest_streak, "day")}
          </p>
        </div>
      )}
      <Link
        href="/student/progress"
        aria-label="View progress and weak topics"
        className="text-sm font-semibold underline underline-offset-4"
      >
        <Target className="size-5 sm:hidden" />
        <span className="hidden sm:inline">Progress</span>
      </Link>
    </Card>
  );
}
async function Continue({ userId }: { userId: string }) {
  const db = await createClient();
  const { data, error } = await db
    .from("sessions")
    .select(
      "id,kind,config,elapsed_s,started_at,attempts(choice_index,answer_text,transcript,image_paths),flashcard_reviews(flashcard_id)",
    )
    .in("kind", ["sprint", "flashcards", "single"])
    .eq("user_id", userId)
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error)
    return (
      <Section title="Continue where you left off">
        <TryAgain what="your unfinished sessions" />
      </Section>
    );
  if (!data.length) return null;
  const topics = await load.topics().catch(() => []);
  return (
    <Section title="Continue where you left off">
      <ul className="divide-y divide-dashed">
        {data.map((s) => {
          const config = s.config as Session["config"] & {
            card_ids?: string[];
          };
          const cards = s.kind === "flashcards";
          const done = cards
            ? new Set(s.flashcard_reviews.map((r) => r.flashcard_id)).size
            : s.attempts.filter(answered).length;
          const total = cards
            ? (config.card_ids?.length ?? 0)
            : s.attempts.length;
          const limit = cards ? null : timeLimit(config);
          const time = continueTime(s, limit, new Date());
          const Icon = KIND_ICON[s.kind as keyof typeof KIND_ICON] ?? Sprint;
          return (
            <li key={s.id} className="flex items-center gap-3">
              <Icon
                aria-hidden
                className="text-muted-foreground size-5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {sessionTitle(s, topics)}
                </p>
                <p className="text-muted-foreground text-[13px]">
                  {done}/{total} {cards ? "cards" : "answered"}
                  {` · ${time}`}
                </p>
              </div>
              {sessionHref(s) && (
                <Link
                  href={sessionHref(s)!}
                  className={buttonVariants({ size: "sm" })}
                >
                  Continue
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

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
          <DueCount userId={id} />
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
      copy: "Open your sessions and results",
    },
  ];
  return (
    <div className="space-y-3" data-testid="student-home">
      {showWelcome && <WelcomeDialog profile={profile} />}
      {!showWelcome && <Shortcut k="s" href="/student/sprint" />}
      <PageHeader
        eyebrow={longDate()}
        title={`${greeting()}${first ? `, ${first}` : ""}`}
      />
      <section
        aria-label="Your study week"
        className="bg-brand/10 border-brand/20 rounded-xl border px-4 py-3"
      >
        <p className="text-brand text-xs font-semibold">NSW school calendar</p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2>{schoolWeek(today)}</h2>
          <p className="text-muted-foreground text-sm">{dailyQuote(today)}</p>
        </div>
      </section>
      <section aria-label="Quick start" className="grid grid-cols-2 gap-3">
        {tiles.map(({ title, href, icon: Icon, copy }) => (
          <Link
            key={href}
            href={href}
            className="bg-card hover:border-brand focus-visible:ring-ring flex min-h-24 min-w-0 flex-col justify-between gap-2 rounded-xl border p-3 outline-none focus-visible:ring-2"
          >
            <Icon className="text-brand size-6" />
            <div>
              <h2 className="text-sm sm:text-base">{title}</h2>
              <p className="text-muted-foreground text-xs">{copy}</p>
            </div>
          </Link>
        ))}
      </section>
      <Suspense fallback={<Card aria-hidden className="h-14 animate-pulse" />}>
        <Streak />
      </Suspense>
      <Suspense fallback={<Card aria-hidden className="h-20 animate-pulse" />}>
        <Continue userId={id} />
      </Suspense>
    </div>
  );
}
