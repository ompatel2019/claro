import { PageHeader } from "@/components/claro/layout";
import { Card } from "@/components/ui/card";
export default function ActivityLoading() {
  return (
    <div
      role="status"
      aria-label="Loading activity"
      className="min-w-0 space-y-5"
    >
      <PageHeader
        title="Activity"
        description="Everything you've done, all in one place."
      />
      <Card aria-hidden className="gap-0 overflow-hidden py-0">
        <div className="bg-muted h-32 animate-pulse" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-14 items-center gap-5 border-b px-5">
            <span className="bg-muted h-4 flex-1 animate-pulse rounded" />
            <span className="bg-muted h-5 w-12 animate-pulse rounded-full" />
            <span className="bg-muted hidden h-4 w-24 animate-pulse rounded sm:block" />
          </div>
        ))}
      </Card>
      <span className="sr-only">Loading your sessions</span>
    </div>
  );
}
