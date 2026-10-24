import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { Sprint } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import {
  parseActivityFilters,
  type ActivityData,
  type SearchParams,
} from "@/lib/activity-filters";
import { sessionLabels, sessionTitle } from "@/lib/session-summary";
import { sydneyToday } from "@/lib/flashcards";
import { type Topic } from "@/lib/practice";
import { PageHeader } from "@/components/claro/layout";
import { ActivityBrowser } from "@/components/activity-browser";
import { buttonVariants } from "@/components/ui/button";
export const metadata = pageMetadata("Activity");

export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const profile = await requireProfile();
  const today = sydneyToday();
  const filters = parseActivityFilters(await searchParams, today);
  const db = await createClient();
  const [total, topics] = await Promise.all([
    db
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .in("kind", ["sprint", "flashcards", "single"])
      // Same rows as activity_stats: finished, or a sprint being marked.
      .or(
        "finished_at.not.is.null,and(kind.eq.sprint,finish_requested_at.not.is.null)",
      ),
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
  ]);
  if (total.error || topics.error || total.count === null)
    throw new Error("Couldn't load your activity.");
  const result = await db.rpc("activity_stats", {
    p_filters: filters,
    p_labels: sessionLabels,
  });
  if (result.error || !result.data)
    throw new Error("Couldn't load your activity.");
  const { score_values: scores, ...activity } = result.data as ActivityData & {
    score_values?: number[];
  };
  const data = { ...activity, all_total: total.count };
  if (scores) {
    // Match the old adapter's JS arithmetic, including raw JSON numeric strings.
    data.stats = {
      ...data.stats,
      average: scores.length
        ? scores.reduce((n, pct) => n + pct, 0) / scores.length
        : null,
      best: scores.length ? Math.max(...scores) : null,
    };
  }
  const sessions = await db
    .from("sessions")
    .select(
      "id,kind,config,finished_at,started_at,score,max_score,flashcard_reviews(flashcard_id,mark,created_at)",
    )
    .eq("user_id", profile.id)
    .in(
      "id",
      data.rows.map((r) => r.id),
    );
  const details = Object.fromEntries(
    (sessions.data ?? []).map((s) => [s.id, s]),
  );
  const rows = data.rows.map((r) => {
    const s = details[r.id];
    return s
      ? {
          ...r,
          title: sessionTitle(s, topics.data as Topic[]),
        }
      : r;
  });
  if (filters.sort === "newest")
    rows.sort((a, b) => b.started_at.localeCompare(a.started_at));
  return (
    <div className="min-w-0">
      <PageHeader
        title="Activity"
        eyebrow={
          filters.sort === "newest"
            ? "Every session, newest first"
            : "Every session"
        }
        actions={
          <Link href="/student/sprint" className={buttonVariants()}>
            <Sprint aria-hidden /> Start sprint
          </Link>
        }
      />
      <ActivityBrowser
        key={JSON.stringify({ ...filters, page: undefined })}
        filters={filters}
        data={{ ...data, rows }}
        details={details}
        topics={topics.data as Topic[]}
        today={today}
      />
    </div>
  );
}
