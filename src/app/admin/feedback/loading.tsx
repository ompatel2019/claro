import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading feedback" className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-9 w-2/3" />
      <Card className="h-96">
        <Skeleton className="m-5 h-[calc(100%-2.5rem)]" />
      </Card>
    </div>
  );
}
