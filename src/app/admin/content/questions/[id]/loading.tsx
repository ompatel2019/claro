import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading question">
      <Skeleton className="mb-4 h-5 w-32" />
      <Skeleton className="mb-6 h-9 w-64 max-w-full" />
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="space-y-4">
          <Card className="p-5">
            <Skeleton className="h-72" />
          </Card>
          <Card className="p-5">
            <Skeleton className="h-72" />
          </Card>
        </div>
        <Card className="p-5">
          <Skeleton className="h-96" />
        </Card>
      </div>
    </div>
  );
}
