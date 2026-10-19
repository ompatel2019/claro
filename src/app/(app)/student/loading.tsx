import { Card } from "@/components/claro/data-display";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading home"
      aria-busy="true"
      className="min-w-0 space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-48 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} aria-hidden className="h-[152px] animate-pulse">
            <Skeleton className="mx-5 h-4 w-24" />
            <Skeleton className="mx-5 mt-auto h-7 w-32" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2.06fr)_minmax(0,1fr)] xl:gap-5">
        {[0, 1].map((i) => (
          <Card key={i} aria-hidden className="h-80 animate-pulse">
            <Skeleton className="mx-5 h-5 w-36" />
            <Skeleton className="mx-5 h-52" />
          </Card>
        ))}
      </div>
    </div>
  );
}
