"use client";
import { useActionState, type ReactNode } from "react";
import { startFlashcards } from "@/app/(app)/flashcards/actions";
import type { DeckConfig } from "@/lib/deck";
import { Button } from "./claro/controls";
import { PortalIcon } from "./icons";
export function FlashcardStart({
  due = false,
  disabled = false,
  mode = "study",
  cardIds = [],
  config,
  label = "Start deck",
  icon = <PortalIcon name="play" />,
  trailing,
  variant,
  size,
  className,
}: {
  due?: boolean;
  disabled?: boolean;
  mode?: "study" | "test";
  cardIds?: string[];
  config?: DeckConfig;
  label?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  variant?: "outline";
  size?: "sm" | "lg";
  className?: string;
}) {
  const [state, action, pending] = useActionState(startFlashcards, {});
  return (
    <form action={action} className="space-y-4">
      {config ? (
        <input type="hidden" name="config" value={JSON.stringify(config)} />
      ) : (
        <>
          <input type="hidden" name="mode" value={mode} />
          {due && <input type="hidden" name="due" value="1" />}
          {cardIds.map((id) => (
            <input key={id} type="hidden" name="card_ids" value={id} />
          ))}
        </>
      )}
      <Button
        type="submit"
        variant={variant}
        size={size}
        className={className}
        disabled={pending || disabled}
      >
        {icon}
        {pending ? "Starting…" : label}
        {trailing}
      </Button>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
