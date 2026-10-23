import { useActionState } from "react";
import { startSprint } from "@/app/(app)/actions";
import { modes } from "@/lib/practice";
import {
  DEFAULTS,
  estimateMinutes,
  withMode,
  withSizeBy,
  withTarget,
  type SetupConfig,
} from "@/lib/sprint";
import { PenCaret } from "../claro/markup-answer";
import { PortalIcon } from "../icons";
import { Button } from "../ui/button";

const QUICK = [
  { label: "20 MC questions · 20 min", config: withMode(DEFAULTS, "mcq") },
  {
    label: "5 short answers · about 23 min",
    config: {
      ...withSizeBy(withMode(DEFAULTS, "short"), "questions"),
    },
  },
];

/** The recommendation uses the same validated start action as the builder. */
export function RecommendedSprint({
  weak,
}: {
  weak?: { id: string; name: string; parent_id: string | null };
}) {
  const [state, action, pending] = useActionState(startSprint, {});
  const config = {
    ...withTarget(withMode(DEFAULTS, "mixed"), 8),
    feedback: "each" as const,
    topics: weak ? [weak.parent_id ?? weak.id] : [],
    subtopics: weak?.parent_id ? [weak.id] : [],
  };
  return (
    <section
      className="home-next grid gap-5 sm:flex sm:items-center sm:justify-between"
      aria-label="Recommended sprint"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <PenCaret />
          Recommended sprint
        </p>
        <h2 className="mt-2 text-2xl font-[650] tracking-tight">
          {weak?.name ?? "A little of everything"}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {weak
            ? "Practise where you’ve dropped marks, while the feedback is fresh."
            : "Start with a mixed sprint across the course to find your next step."}
        </p>
        <p className="text-muted-foreground mt-3 text-[13px] tabular-nums">
          8 questions · about {estimateMinutes(config)} min · Check as I go
        </p>
      </div>
      <form action={action}>
        <Button
          name="config"
          value={JSON.stringify(config)}
          type="submit"
          disabled={pending}
        >
          <PortalIcon name="arrow-right" />
          {pending ? "Building…" : "Start recommended sprint"}
        </Button>
        {state.error && (
          <p role="alert" className="text-destructive mt-2 text-sm">
            <PortalIcon name="circle-alert" className="mr-1 inline size-4" />
            {state.error}
          </p>
        )}
      </form>
    </section>
  );
}

/** §3.1 Quick start: one click straight into a sprint (used on Home). */
export function QuickStarts({
  weak,
  previous,
  previousRaw,
}: {
  weak?: { id: string; name: string; parent_id: string | null };
  previous?: SetupConfig;
  previousRaw?: Record<string, unknown>;
} = {}) {
  const [state, action, pending] = useActionState(startSprint, {});
  const previousSizeBy =
    previousRaw?.size_by === "marks" ||
    (previous?.mode === "mixed" &&
      previousRaw &&
      !("short_count" in previousRaw))
      ? "marks"
      : previous?.size_by;
  return (
    <form action={action} className="contents">
      {[
        ...(weak
          ? [
              {
                label: "Mixed · 8 questions · about 15 min",
                title: `Weak spot: ${weak.name}`,
                icon: "target" as const,
                config: {
                  ...withTarget(withMode(DEFAULTS, "mixed"), 8),
                  topics: [weak.parent_id ?? weak.id],
                  subtopics: weak.parent_id ? [weak.id] : [],
                },
              },
            ]
          : []),
        ...(previous
          ? [
              {
                label: `${modes[previous.mode].label}${typeof previousRaw?.target === "number" ? ` · ${previousRaw.target} ${previousSizeBy}` : ""} · ${previous.topics.length} topic${previous.topics.length === 1 ? "" : "s"}`,
                title: "Same as last time",
                icon: "rotate-ccw" as const,
                config: previous,
              },
            ]
          : []),
        ...QUICK.slice(0, weak || previous ? 1 : 2).map((q) => ({
          ...q,
          title:
            q.config.mode === "mcq"
              ? "Section I drill"
              : "Short answer practice",
          icon:
            q.config.mode === "mcq" ? ("list" as const) : ("pen-line" as const),
        })),
      ].map((q) => (
        <Button
          key={q.label}
          name="config"
          value={JSON.stringify(
            q.title === "Same as last time"
              ? (previousRaw ?? q.config)
              : q.config,
          )}
          type="submit"
          variant="outline"
          className="bg-card h-auto min-w-0 justify-start gap-3 rounded-2xl p-4 text-left whitespace-normal"
          aria-label={q.label}
          disabled={pending}
        >
          <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
            <PortalIcon name={q.icon} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{q.title}</span>
            <span className="text-muted-foreground mt-0.5 block text-[13px]">
              {q.config.mode === "mcq"
                ? `${q.config.target} multiple choice · ${estimateMinutes(q.config)} min`
                : q.label}
            </span>
          </span>
          <PortalIcon
            name="arrow-right"
            className="text-muted-foreground size-4 shrink-0"
          />
        </Button>
      ))}
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** Results "Same setup again": starts a new sprint with this session's settings. */
export function SameSetup({ config }: { config: object }) {
  const [state, action, pending] = useActionState(startSprint, {});
  return (
    <form action={action}>
      <Button
        variant="outline"
        name="config"
        value={JSON.stringify(config)}
        type="submit"
        disabled={pending}
      >
        <PortalIcon name="rotate-ccw" className="size-4" />
        {pending ? "Building…" : "Same setup again"}
      </Button>
      {state.error && (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {state.error}
        </p>
      )}
    </form>
  );
}
