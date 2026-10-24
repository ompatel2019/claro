"use client";

import Link from "next/link";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Help } from "@/components/icons";
import { Popover, PopoverContent } from "@/components/ui/popover";

/** The queue explainer, behind an outline help icon beside the page title. */
export function ReviewHelp() {
  return (
    <Popover>
      <PopoverPrimitive.Trigger
        aria-label="About the review queue"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-grid size-7 place-items-center rounded-md align-middle outline-none focus-visible:ring-3"
      >
        <Help size={16} aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      <PopoverContent align="start" className="w-80 leading-relaxed">
        <p>
          Students select <strong>Question this mark</strong> beside written
          feedback on their{" "}
          <Link className="underline" href="/student/activity">
            finished session results
          </Link>
          .
        </p>
        <p className="text-muted-foreground">
          Dispute history counts all requests; rejection rates use resolved
          disputes with unchanged or lowered marks.
        </p>
      </PopoverContent>
    </Popover>
  );
}
