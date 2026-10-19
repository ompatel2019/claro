import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading students" className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-9 w-2/3" />
      <Card className="h-96">
        <Skeleton className="mx-5 h-6" />
        <Skeleton className="mx-5 h-64" />
      </Card>
    </div>
  );
}
