import { Cards, Pen, Sprint } from "@/components/icons";

export function SessionIcon({ kind }: { kind: string }) {
  const Icon = kind === "flashcards" ? Cards : kind === "single" ? Pen : Sprint;
  return (
    <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
      <Icon aria-hidden className="size-4" />
    </span>
  );
}
