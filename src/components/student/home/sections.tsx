import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import type { ProgressData } from "@/lib/progress";
import { practiseHref } from "@/lib/progress";
import { type Session, type Topic } from "@/lib/practice";
import { Card } from "@/components/ui/card";
import { TryAgain } from "@/components/try-again";
import { SessionList } from "@/components/session-list";
import { BarList } from "@/components/claro/data-display";
import { PortalIcon } from "@/components/icons";
export type HomeProgress = Promise<ProgressData | null>;
export type HomeSession = Session & {
  recall?: { knew: number; total: number };
};
export type HomeSessions = Promise<HomeSession[] | null>;

export async function readHomeSessions(userId: string): HomeSessions {
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .in("kind", ["sprint", "flashcards", "single"])
      .order("started_at", { ascending: false })
      .limit(3);
    if (error) return null;
    const rows = (data ?? []) as HomeSession[];
    const ids = rows
      .filter((s) => s.kind === "flashcards" && s.finished_at)
      .map((s) => s.id);
    if (ids.length) {
      const reviews: { session_id: string | null; mark: number }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await db
          .from("flashcard_reviews")
          .select("session_id,mark")
          .eq("user_id", userId)
          .in("session_id", ids)
          .order("id")
          .range(offset, offset + 999);
        if (result.error) return rows;
        reviews.push(...(result.data ?? []));
        if (!result.data || result.data.length < 1000) break;
      }
      for (const row of rows) {
        const outcomes = reviews.filter((r) => r.session_id === row.id);
        if (outcomes.length)
          row.recall = {
            knew: outcomes.filter((r) => r.mark === 1).length,
            total: outcomes.length,
          };
      }
    }
    return rows;
  } catch {
    return null;
  }
}
async function readHomeTopics(): Promise<Topic[] | null> {
  try {
    const db = await createClient();
    const result = await db
      .from("topics")
      .select("id,parent_id,name,sort")
      .order("sort");
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}

function HomeCard({
  title,
  description,
  href,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <Card className="h-full min-w-0 gap-4 p-5">
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && (
            <p className="text-muted-foreground mt-1 text-[13px]">
              {description}
            </p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            aria-label={`Open ${title}`}
            className="text-muted-foreground flex shrink-0 items-center gap-1 text-[13px]"
          >
            {href.includes("activity") ? "Activity" : "Progress"}
            <PortalIcon name="arrow-up-right" className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}
export async function HomeRecent({ sessions }: { sessions: HomeSessions }) {
  const [rows, topics] = await Promise.all([sessions, readHomeTopics()]);
  return (
    <HomeCard
      title="Recent sessions"
      description="Pick up where you left off"
      href="/student/activity"
    >
      {rows ? (
        <SessionList sessions={rows} topics={topics ?? []} />
      ) : (
        <TryAgain what="your recent sessions" />
      )}
    </HomeCard>
  );
}
export async function HomeLostMarks({
  progress,
  caption = "Marks dropped in the selected range",
}: {
  progress: HomeProgress;
  caption?: string;
}) {
  const d = await progress;
  const rows = d?.topics
    .filter((t) => t.parent_id && t.possible > t.earned)
    .sort((a, b) => b.possible - b.earned - (a.possible - a.earned))
    .slice(0, 5);
  return (
    <HomeCard title="Where your marks go" description={caption}>
      {!d ? (
        <TryAgain what="your dropped marks" />
      ) : rows?.length ? (
        <BarList
          unit="marks"
          rows={rows.map((t) => ({
            label: t.name,
            value: t.possible - t.earned,
            href: practiseHref(t),
          }))}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          No dropped marks in this range.
        </p>
      )}
    </HomeCard>
  );
}
