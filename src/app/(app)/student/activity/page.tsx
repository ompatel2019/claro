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
import {
  sessionLabels,
  sessionTitle,
  sessionHref,
} from "@/lib/session-summary";
import { sydneyToday } from "@/lib/flashcards";
import { type Topic } from "@/lib/practice";
import { PageHeader } from "@/components/claro/layout";
import { ActivityBrowser } from "@/components/activity-browser";
import { SessionIcon } from "@/components/student/activity/session-icon";
import { StatusPill } from "@/components/status-pill";
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
      .in("kind", ["sprint", "flashcards", "single"]),
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
          status: !s.finished_at ? ("In progress" as const) : r.status,
        }
      : r;
  });
  if (filters.sort === "newest")
    rows.sort((a, b) => b.started_at.localeCompare(a.started_at));
  const pendingResult = await db
    .from("sessions")
    .select(
      "id,kind,config,finished_at,started_at,flashcard_reviews(flashcard_id,mark,created_at)",
    )
    .eq("user_id", profile.id)
    .is("finished_at", null)
    .in("kind", ["sprint", "flashcards", "single"])
    .order("started_at", { ascending: false })
    .limit(4);
  const pending = (pendingResult.data ?? []).filter((s) => !s.finished_at);
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
      {pending.length > 0 && (
        <section className="ac-card mb-5" aria-label="Unfinished sessions">
          <ul>
            {pending.map((s) => {
              const r = rows.find((r) => r.id === s.id);
              const label = sessionTitle(s, topics.data as Topic[])
                .split(" · ")
                .slice(0, s.kind === "flashcards" ? 2 : 1)
                .join(" · ");
              return (
                <li key={s.id} className="ac-row live">
                  <SessionIcon kind={s.kind} />
                  <div className="min-w-0">
                    <p className="ac-title">{label}</p>
                    <p className="ac-meta">
                      <span>
                        {s.kind === "flashcards" &&
                        Array.isArray(s.flashcard_reviews)
                          ? `${new Set(s.flashcard_reviews.map((v: { flashcard_id: string }) => v.flashcard_id)).size} of ${s.config.card_ids?.length ?? r?.items ?? 0} reviewed`
                          : s.kind !== "flashcards" && r
                            ? `${r.answered} of ${r.items} answered`
                            : "Unfinished session"}
                      </span>
                      <span>
                        Started{" "}
                        {sydneyToday(new Date(s.started_at)) === today
                          ? "today"
                          : new Date(s.started_at).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                              timeZone: "Australia/Sydney",
                            })}
                      </span>
                    </p>
                  </div>
                  <div className="ac-res">
                    <StatusPill pill="In progress" />
                  </div>
                  <Link
                    href={sessionHref(s)!}
                    className={buttonVariants({ size: "sm" })}
                  >
                    {s.kind === "flashcards" ? "Continue" : "Finish and mark"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
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
