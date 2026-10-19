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
import { studentActivity } from "@/lib/activity-data";
import { sessionLabels } from "@/lib/session-summary";
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
      <ActivityBrowser
        key={JSON.stringify(filters)}
        filters={filters}
        data={data}
        topics={topics.data as Topic[]}
        today={today}
      />
    </div>
  );
}
