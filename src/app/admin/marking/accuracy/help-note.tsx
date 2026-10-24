"use client";

import type { ReactNode } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Help } from "@/components/icons";
import { Popover, PopoverContent } from "@/components/ui/popover";

/** An outline help button that opens a short explanation on click or tap. */
export function HelpNote({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverPrimitive.Trigger
        aria-label={label}
        className="text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Help className="size-4" />
      </PopoverPrimitive.Trigger>
      <PopoverContent
        align="start"
        className="text-muted-foreground w-80 max-w-[calc(100vw-2rem)] rounded-lg text-[13px] leading-relaxed shadow-none"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
