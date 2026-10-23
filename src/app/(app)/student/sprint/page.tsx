import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { restore } from "@/lib/sprint";
import { continueTime } from "@/lib/home";
import { Alert } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import {
  answered,
  modeLabel,
  timeLimit,
  type Session,
  type Topic,
} from "@/lib/practice";
import { PageHeader } from "@/components/claro/layout";
import {
  SprintSetup,
  QuickStarts,
  RecommendedSprint,
} from "@/components/sprint-setup";
import { FinishSprint } from "@/components/finish-sprint";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = pageMetadata("Topic Sprint");

export default async function SprintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const profile = await requireProfile();
  const db = await createClient();
  const [topics, open, progress, previous] = await Promise.all([
    db.from("topics").select("id,parent_id,name,sort").order("sort"),
    db
      .from("sessions")
      .select("*,attempts(choice_index,answer_text,transcript,status)")
      .eq("user_id", profile.id)
      .eq("kind", "sprint")
      .is("finished_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
  const unfinished = open.data as
    | (Session & {
        attempts: (Parameters<typeof answered>[0] & { status: string })[];
      })
    | null;
  const allMarked =
    !!unfinished?.attempts.length &&
    unfinished.attempts.every((a) => a.status === "marked");
  const limit = unfinished && timeLimit(unfinished.config);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Topic Sprint"
        description="Start with a recommendation, or build the practice you need."
      />
      {unfinished && (
        <Card className="py-3.5">
          <CardContent className="flex flex-col items-start gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:flex-1">
              <span className="bg-warning-soft text-warning grid size-9 shrink-0 place-items-center rounded-xl">
                <Alert aria-hidden className="size-4" />
              </span>
              <div>
                <p className="font-semibold">
                  You have an unfinished {modeLabel(unfinished.config.mode)}{" "}
                  sprint
                </p>
                <p className="text-muted-foreground text-[13px]">
                  {unfinished.attempts.filter(answered).length} of{" "}
                  {unfinished.attempts.length} answered
                  {` · ${continueTime(unfinished, limit, new Date())}`}
                </p>
              </div>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:max-w-xs">
              <Link
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                href={`/student/sprint/${unfinished.id}${allMarked ? "/results" : ""}`}
              >
                {allMarked ? "View results" : "Continue"}
              </Link>
              <FinishSprint id={unfinished.id} />
            </div>
          </CardContent>
        </Card>
      )}
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
