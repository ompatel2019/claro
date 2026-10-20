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
  return (
    <form action={action} className="contents">
      {[
        ...(weak
          ? [
              {
                label: "Mixed · 12 marks · 15 min",
                title: `Weak spot: ${weak.name}`,
                icon: "target" as const,
                config: {
                  ...withTarget(withMode(DEFAULTS, "mixed"), 12),
                  topics: [weak.parent_id ?? weak.id],
                  subtopics: weak.parent_id ? [weak.id] : [],
                },
              },
            ]
          : []),
        ...(previous
          ? [
              {
                label: `${modes[previous.mode].label}${typeof previousRaw?.target === "number" ? ` · ${previousRaw.target} ${previous.size_by}` : ""} · ${previous.topics.length} topic${previous.topics.length === 1 ? "" : "s"}`,
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
          className="bg-card h-auto justify-start gap-3 rounded-xl p-3.5 text-left shadow-xs"
          aria-label={q.label}
          disabled={pending}
        >
          <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
            <PortalIcon name={q.icon} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{q.title}</span>
            <span className="text-muted-foreground mt-0.5 block text-xs">
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
