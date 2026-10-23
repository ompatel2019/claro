import { Cards, Pen, Sprint, type IconProps } from "@/components/icons";

export function SessionGlyph({ kind, ...props }: IconProps & { kind: string }) {
  if (kind === "flashcards") return <Cards {...props} />;
  if (kind === "single") return <Pen {...props} />;
  return <Sprint {...props} />;
}

export function SessionIcon({ kind }: { kind: string }) {
  return (
    <span className="ac-ic">
      <SessionGlyph kind={kind} aria-hidden size={20} strokeWidth={1.5} />
    </span>
  );
}
