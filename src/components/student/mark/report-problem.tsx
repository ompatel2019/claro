"use client";
import { useFeedback } from "@/components/feedback-widget";
import { Button } from "@/components/ui/button";
import { PortalIcon } from "@/components/icons";

export function MarkReportProblem({
  questionId,
  sessionId,
}: {
  questionId: string;
  sessionId: string;
}) {
  const open = useFeedback();
  return (
    <Button
      variant="ghost"
      onClick={() => open({ kind: "content", questionId, sessionId })}
    >
      <PortalIcon name="flag" />
      Report a problem
    </Button>
  );
}
