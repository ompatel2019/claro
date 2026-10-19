import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading student" className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="h-28">
            <Skeleton className="mx-4 h-4" />
            <Skeleton className="mx-4 h-8 w-1/2" />
          </Card>
        ))}
      </div>
      <Card className="h-52">
        <Skeleton className="mx-5 h-4 w-32" />
        <Skeleton className="mx-5 h-28" />
      </Card>
      <Skeleton className="h-9 w-full" />
      <Card className="h-80">
        <Skeleton className="mx-5 h-6" />
        <Skeleton className="mx-5 h-56" />
      </Card>
    </div>
  );
}
