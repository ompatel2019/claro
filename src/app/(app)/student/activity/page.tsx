import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { Sprint, Cards, Pen } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import {
  parseActivityFilters,
  type ActivityData,
  type SearchParams,
} from "@/lib/activity-filters";
import { studentActivity } from "@/lib/activity-data";
import {
  sessionLabels,
  sessionTitle,
  sessionHref,
} from "@/lib/session-summary";
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
      .in("kind", ["sprint", "flashcards", "single"]),
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
  ]);
  if (total.error || topics.error || total.count === null)
    throw new Error("Couldn't load your activity.");
  const data = await studentActivity(
    filters,
    async (page) => {
      const result = await db.rpc("activity_stats", {
        p_filters: { ...filters, page },
        p_labels: sessionLabels,
      });
      if (result.error || !result.data)
        throw new Error("Couldn't load your activity.");
      return result.data as ActivityData;
    },
    total.count,
  );
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
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Activity"
        description="Everything you've done, all in one place."
        actions={
          <Link href="/student/sprint" className={buttonVariants()}>
            <Sprint aria-hidden /> Start sprint
          </Link>
        }
      />
      {pending.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {pending.map((s) => {
            const r = rows.find((r) => r.id === s.id);
            const label = sessionTitle(s, topics.data as Topic[])
              .split(" · ")
              .slice(0, s.kind === "flashcards" ? 2 : 1)
              .join(" · ");
            return (
              <div
                key={s.id}
                className="bg-card shadow-card flex flex-wrap items-center gap-x-3 gap-y-4 rounded-2xl border p-3.5 max-sm:p-3.5"
              >
                <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-xl">
                  {s.kind === "flashcards" ? (
                    <Cards className="size-4" aria-hidden />
                  ) : s.kind === "single" ? (
                    <Pen className="size-4" aria-hidden />
                  ) : (
                    <Sprint className="size-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{label}</p>
                    <span className="rounded-full border px-2 text-[11px]">
                      In progress
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[13px]">
                    {s.kind === "flashcards" &&
                    Array.isArray(s.flashcard_reviews)
                      ? `${new Set(s.flashcard_reviews.map((v: { flashcard_id: string }) => v.flashcard_id)).size} of ${s.config.card_ids?.length ?? r?.items ?? 0} reviewed`
                      : s.kind !== "flashcards" && r
                        ? `${r.answered} of ${r.items} answered`
                        : "Unfinished session"}{" "}
                    · started{" "}
                    {sydneyToday(new Date(s.started_at)) === today
                      ? "today"
                      : new Date(s.started_at).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          timeZone: "Australia/Sydney",
                        })}
                  </p>
                </div>
                <div className="max-sm:w-full sm:contents">
                  <Link
                    href={sessionHref(s)!}
                    className={buttonVariants({
                      size: "sm",
                      className: "max-sm:mr-auto max-sm:basis-auto",
                    })}
                  >
                    {s.kind === "flashcards" ? "Continue" : "Finish and mark"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
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
