"use client";

import { useState } from "react";
import { Help } from "@/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AgreementLabel() {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      Check agreement
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          aria-label="About check agreement"
          closeOnClick={false}
          onClick={() => setOpen(true)}
          className="inline-flex size-7 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Help className="size-4" />
        </TooltipTrigger>
        <TooltipContent role="tooltip">
          Agreed ÷ checked written answers in this range. This is the current AI
          checker status, not human-verified accuracy; reviews and student
          disputes can change that status. Admin-verified accuracy uses only
          staff-initiated reviews resolved by an admin.
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
