"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/icons";
export default function Error({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <Card className="w-full max-w-[1400px] items-start p-5">
      <p
        role="alert"
        className="bg-destructive-soft text-destructive border-destructive/20 flex items-center gap-2 rounded-lg border p-3 text-sm"
      >
        <Alert className="size-4" />
        {"Couldn't load this. Try again."}
      </p>
      <Button variant="outline" onClick={unstable_retry}>
        Try again
      </Button>
    </Card>
  );
}
