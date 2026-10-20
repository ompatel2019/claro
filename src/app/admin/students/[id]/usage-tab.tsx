import Link from "next/link";
import { AI_RATE_LIMIT_PER_HOUR } from "@/lib/ai/rate-limit";
import { StatCard } from "@/components/claro/data-display";
import { ServerTable } from "@/components/static-table-server";
import { buttonVariants } from "@/components/ui/button";

export function UsageTab({
  usage,
  lastHour,
  spend,
  params,
}: {
  usage: {
    task: string;
    calls: number;
    tokens: number;
    usd: number;
  }[];
  lastHour: number;
  spend: number;
  params: Record<string, string | undefined>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          title="Calls in the last hour"
          value={`${lastHour} of ${AI_RATE_LIMIT_PER_HOUR}`}
          description="Rate limit per student"
        />
        <StatCard title="Spend, last 30 days" value={`$${spend.toFixed(2)}`} />
      </div>
      <ServerTable
        params={params}
        label="AI usage by task"
        columns={[
          {
            id: "task",
            header: "Task",
            sortable: true,
            className:
              "max-sm:max-w-36 max-sm:whitespace-normal max-sm:break-words",
          },
          {
            id: "calls",
            header: "Calls",
            sortable: true,
            className: "hidden sm:table-cell",
          },
          {
            id: "tokens",
            header: "Tokens",
            sortable: true,
            className: "hidden sm:table-cell",
          },
          {
            id: "usd",
            header: "USD",
            sortable: true,
            className: "max-sm:px-2",
          },
        ]}
        rows={usage.map((t) => ({
          id: t.task,
          cells: {
            task: t.task,
            calls: t.calls,
            tokens: t.tokens.toLocaleString("en-AU"),
            usd: `$${t.usd.toFixed(4)}`,
          },
          keys: { task: t.task, calls: t.calls, tokens: t.tokens, usd: t.usd },
        }))}
      />
      <Link
        href="/admin/spend"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Open AI spend
      </Link>
    </div>
  );
}
