"use client";

import { useState } from "react";
import { CardEditor } from "@/components/card-editor";
import { Button } from "@/components/claro/controls";
import { PortalIcon } from "@/components/icons";
import type { Topic } from "@/lib/practice";

export function NewCard({
  topics,
  label = "New card",
  variant,
  size,
}: {
  topics: Topic[];
  label?: string;
  variant?: "outline";
  size?: "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <PortalIcon name="plus" />
        {label}
      </Button>
      {open && (
        <CardEditor
          topics={topics.filter((t) => t.parent_id)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
