"use client";

import { useFeedback } from "@/components/feedback-widget";
import { PortalIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/** Sprint sessions already expose feedback in their mobile tools menu. */
export function MobileFocusFeedback() {
  const feedback = useFeedback();
  return (
    <Button
      data-component="MobileFocusFeedback"
      variant="ghost"
      size="icon-sm"
      className="size-6 sm:hidden [[data-component=FocusBar]:has([aria-label='More_tools'])_&]:hidden"
      aria-label="Send feedback"
      onClick={() => feedback()}
    >
      <PortalIcon name="message-circle" />
    </Button>
  );
}
