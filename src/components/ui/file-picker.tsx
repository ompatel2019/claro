"use client";

import { useState, type ComponentProps } from "react";
import { PortalIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

type FilePickerProps = Omit<ComponentProps<"input">, "type" | "children"> & {
  label: string;
  icon?: "upload" | "camera";
};

export function FilePicker({
  label,
  icon = "upload",
  className,
  disabled,
  onChange,
  ...props
}: FilePickerProps) {
  const [names, setNames] = useState<string[]>([]);

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <label
        className={cn(
          buttonVariants({ variant: "outline" }),
          "focus-within:ring-ring/15 relative cursor-pointer focus-within:ring-3",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <PortalIcon name={icon} />
        {label}
        <input
          {...props}
          type="file"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            setNames(Array.from(event.target.files ?? [], (file) => file.name));
            onChange?.(event);
          }}
        />
      </label>
      {names.length > 0 && (
        <span className="text-muted-foreground min-w-0 text-sm break-words">
          {names.join(", ")}
        </span>
      )}
    </div>
  );
}
