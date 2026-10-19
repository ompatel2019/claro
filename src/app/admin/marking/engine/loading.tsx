import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading marking engine"
      className="min-w-0 space-y-4"
    >
      <Skeleton aria-hidden="true" className="h-20 w-full" />
      <Skeleton aria-hidden="true" className="h-9 w-48" />
      <Card>
        <CardContent>
          <Skeleton aria-hidden="true" className="h-96 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
