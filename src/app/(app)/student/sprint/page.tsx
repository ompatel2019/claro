import { pageMetadata } from "@/lib/page-metadata";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { type Topic } from "@/lib/practice";
import { PageHeader } from "@/components/claro/layout";
import { SprintSetup } from "@/components/sprint-setup";

export const metadata = pageMetadata("Topic Sprint");

export default async function SprintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireProfile();
  const db = await createClient();
  const [topics, progress] = await Promise.all([
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
    db.rpc("student_progress"),
  ]);
  if (topics.error) throw new Error("Could not load topics.");
  const measured = (progress.data?.topics ?? []) as {
    id: string;
    answered: number;
    pct: number | null;
  }[];
  const p = await searchParams;
  const params = Object.fromEntries(
    ["type", "topics", "sub", "history", "size"].map((k) => [k, p[k]]),
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Topic Sprint"
        description="Build the practice you need."
      />
      <SprintSetup
        topics={(topics.data ?? []) as Topic[]}
        params={params}
        mastery={Object.fromEntries(measured.map((t) => [t.id, t.pct]))}
      />
    </div>
  );
}
