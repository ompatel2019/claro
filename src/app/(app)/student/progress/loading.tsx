import { Skeleton } from "@/components/ui/skeleton";

const Card = ({ h }: { h: string }) => (
  <div className="progress-card space-y-3">
    <Skeleton className="h-5 w-40" />
    <Skeleton className="h-4 w-56" />
    <Skeleton className={`${h} w-full`} />
  </div>
);
export default function Loading() {
  return (
    <div
      className="progress-page"
      aria-label="Loading progress"
      aria-busy="true"
    >
      <div className="progress-hd">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-80 max-w-full" />
      </div>
      <div className="progress-grid progress-grid--a">
        <Card h="h-64" />
        <Card h="h-64" />
      </div>
      <div className="progress-grid progress-grid--b">
        <Card h="h-48" />
        <Card h="h-48" />
      </div>
      <Card h="h-56" />
    </div>
  );
}
