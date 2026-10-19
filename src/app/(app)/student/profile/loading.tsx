import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div
      className="grid w-full max-w-[1400px] min-w-0 grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5"
      aria-label="Loading profile"
      aria-busy="true"
    >
      <Skeleton className="h-9 w-40 xl:col-span-2" />
      {["h-80", "h-64", "h-48", "h-48", "h-16"].map((height, i) => (
        <Card key={i} className={`p-5 ${i > 1 ? "xl:col-span-2" : ""}`}>
          <Skeleton className="h-6 w-36" />
          <Skeleton className={`${height} w-full`} />
        </Card>
      ))}
    </div>
  );
}
