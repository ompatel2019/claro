import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
const paths = {
  tick: "M4 13.5c2 1.7 3.6 3.5 5.2 5.9 3.2-6.4 6.6-11.2 11.3-15.2",
  cross: "M5.5 5.5c4 4.1 8.1 8.5 13.3 13.3M18.6 5.2c-4.6 4.6-8.6 8.8-13.2 13.7",
  caret: "M5 18.5 12 6.5l7 12",
  wave: "M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0",
};
function Pen({
  kind,
  className,
  ...props
}: ComponentProps<"svg"> & { kind: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("pen size-4", className)}
      {...props}
    >
      <path strokeWidth="2.4" d={paths[kind]} />
    </svg>
  );
}
export const PenTick = (props: ComponentProps<"svg">) => (
  <Pen kind="tick" {...props} />
);
export const PenCross = (props: ComponentProps<"svg">) => (
  <Pen kind="cross" {...props} />
);
export const PenCaret = (props: ComponentProps<"svg">) => (
  <Pen kind="caret" {...props} />
);
export const PenWave = (props: ComponentProps<"svg">) => (
  <Pen kind="wave" {...props} />
);
export function PenCircle({ children }: { children: ReactNode }) {
  return (
    <span data-component="PenCircle" className="relative inline-block px-1.5">
      {children}
      <svg
        className="pen pen-draw pointer-events-none absolute -inset-x-1.5 -inset-y-2 h-[calc(100%+16px)] w-[calc(100%+12px)]"
        viewBox="0 0 120 48"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          pathLength="1"
          strokeWidth="2.4"
          d="M14 31C8 20 22 8 52 6c30-2 60 5 61 17s-25 20-55 20C30 43 8 38 9 26c1-8 15-15 31-17"
        />
      </svg>
    </span>
  );
}
export type MarkupNote = {
  n: number;
  kind: "credit" | "improve" | "missing";
  title: string;
  text: string;
};
export function MarkupAnswer({
  segments,
  notes,
}: {
  segments: {
    text: string;
    kind?: "credit" | "improve";
    note?: number;
    caret?: boolean;
  }[];
  notes: MarkupNote[];
}) {
  const id = useId();
  return (
    <div
      data-component="MarkupAnswer"
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]"
    >
      <div
        className="booklet min-h-[116px]"
        aria-label="Your answer, with examiner notes"
      >
        {segments.map((s, i) => (
          <span key={i}>
            <span className={s.kind ? `mk mk-${s.kind}` : undefined}>
              {s.text}
            </span>
            {s.caret && <PenCaret className="inline size-4" />}
            {s.note && (
              <a href={`#${id}-${s.note}`} className="mk-tag">
                {s.kind === "credit" && <PenTick className="inline size-3.5" />}
                {s.note}
              </a>
            )}
          </span>
        ))}
      </div>
      <ol className="grid gap-2" aria-label="Examiner notes">
        {notes.map((n) => (
          <li
            id={`${id}-${n.n}`}
            key={n.n}
            tabIndex={0}
            className="bg-card hover:bg-accent flex gap-3 rounded-lg border p-3"
          >
            <span className="bg-brand-soft text-brand-text grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
              {n.n}
            </span>
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                {n.kind === "credit" ? (
                  <PenTick />
                ) : n.kind === "improve" ? (
                  <PenWave />
                ) : (
                  <PenCaret />
                )}
                {n.title}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[13px] leading-snug">
                {n.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
