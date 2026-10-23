import { pageMetadata } from "@/lib/page-metadata";
import { restore } from "@/lib/sprint";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { type Topic } from "@/lib/practice";
import { PageHeader } from "@/components/claro/layout";
import {
  SprintSetup,
  QuickStarts,
  RecommendedSprint,
} from "@/components/sprint-setup";

export const metadata = pageMetadata("Topic Sprint");

export default async function SprintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const profile = await requireProfile();
  const db = await createClient();
  const [topics, progress, previous] = await Promise.all([
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
    db.rpc("student_progress"),
    db
      .from("sessions")
      .select("config")
      .eq("user_id", profile.id)
      .eq("kind", "sprint")
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (topics.error) throw new Error("Could not load topics.");
  const measured = (progress.data?.topics ?? []) as {
    id: string;
    answered: number;
    pct: number | null;
  }[];
  const weakest = measured
    .filter((t) => t.answered > 0 && t.pct != null)
    .sort((a, b) => a.pct! - b.pct!)[0];
  const weak = (topics.data as Topic[]).find((t) => t.id === weakest?.id);
  const p = await searchParams;
  const params = Object.fromEntries(
    ["type", "topics", "sub", "history", "verb", "size"].map((k) => [k, p[k]]),
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Topic Sprint"
        description="Start with a recommendation, or build the practice you need."
      />
      <RecommendedSprint weak={weak} />
      <div className="grid gap-4 sm:grid-cols-2">
        <QuickStarts
          previousRaw={previous.data?.config}
          previous={
            previous.data?.config ? restore(previous.data.config) : undefined
          }
        />
      </div>
      <SprintSetup
        topics={(topics.data ?? []) as Topic[]}
        params={params}
        mastery={Object.fromEntries(measured.map((t) => [t.id, t.pct]))}
      />
    </div>
  );
}
