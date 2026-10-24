"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Alert, ChevronDown, SearchOff, PortalIcon } from "@/components/icons";
import { startSprint } from "@/app/(app)/actions";
import { createClient } from "@/utils/supabase/client";
import { modes, type Mode, type Topic } from "@/lib/practice";
import {
  clampPace,
  validPace,
  DEFAULTS,
  estimateMinutes,
  estimatedMarks,
  filtersOn,
  fromParams,
  HISTORY_LABELS,
  restore,
  size,
  summary,
  withMode,
  withTarget,
  withMixedCount,
  withSizeBy,
  type Difficulty,
  type History,
  type Pool,
  type SetupConfig,
} from "@/lib/sprint";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { Badge } from "./claro/controls";
import { Meter } from "./claro/data-display";
import { Button } from "./ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Input } from "./ui/input";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Switch } from "./ui/switch";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

import { Section, Choice, Chip, Stepper } from "./sprint-setup/parts";
export {
  QuickStarts,
  SameSetup,
  RecommendedSprint,
} from "./sprint-setup/starts";

const KEY = "claro.sprint.v1";
const DIFFICULTY: [Difficulty, string][] = [
  ["foundation", "Foundation · 1–3 marks"],
  ["standard", "Standard · 4–5 marks"],
  ["challenging", "Challenging · 6+ marks"],
];
const n = (v: number | undefined) => (v === undefined ? "–" : String(v));

/** Every control updates the live pool and the summary beside the builder. */
export function SprintSetup({
  topics,
  params,
  mastery = {},
}: {
  topics: Topic[];
  mastery?: Record<string, number | null>;
  params: Record<string, string | undefined>;
}) {
  const feedbackId = useId();
  const [c, setC] = useState<SetupConfig>(DEFAULTS);
  const [prefilled, setPrefilled] = useState<SetupConfig | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [poolError, setPoolError] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [state, action, pending] = useActionState(startSprint, {});
  const form = useRef<HTMLFormElement>(null);
  const ready = useRef(false);
  const parents = topics.filter((t) => !t.parent_id);
  const names = Object.fromEntries(topics.map((t) => [t.id, t.name]));

  useEffect(() => {
    // Saved setup lives in localStorage, which only exists after mount.
    let saved = DEFAULTS;
    try {
      saved = restore(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    } catch {}
    const fromUrl = fromParams(params, saved);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setC(fromUrl ?? saved);
    if (fromUrl) setPrefilled(saved);
    ready.current = true;
  }, [params]);

  useEffect(() => {
    if (!ready.current) return;
    localStorage.setItem(KEY, JSON.stringify(c));
    let live = true;
    const t = setTimeout(async () => {
      const { data, error } = await createClient().rpc("sprint_pool", {
        p_config: c,
      });
      if (!live) return;
      setPoolError(!!error);
      if (!error) setPool(data as Pool);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [c]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        form.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const set = (patch: Partial<SetupConfig>) =>
    setC((o) => ({ ...o, ...patch }));
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  function toggleTopic(id: string) {
    if (!c.topics.includes(id) && c.topics.length >= 2) {
      setLimitHit(true);
      return;
    }
    setLimitHit(false);
    set({
      topics: toggle(c.topics, id),
      subtopics: c.subtopics.filter(
        (sub) => topics.find((topic) => topic.id === sub)?.parent_id !== id,
      ),
    });
  }

  const s = size(c);
  const invalidSize = c.target < s.min || c.target > s.max;
  const written = c.mode === "short" || c.mode === "mixed";
  const byMarks = c.size_by === "marks";
  const available = pool
    ? c.mode === "mixed" &&
      pool.mcq_questions !== undefined &&
      pool.short_questions !== undefined
      ? Math.min(c.mcq_count, pool.mcq_questions) +
        Math.min(c.short_count, pool.short_questions)
      : byMarks
        ? pool.marks
        : pool.questions
    : null;
  const matching = pool
    ? c.mode === "mixed" && pool.mcq_questions !== undefined
      ? c.mcq_count === 0
        ? pool.questions - pool.mcq_questions
        : c.short_count === 0
          ? pool.mcq_questions
          : pool.questions
      : pool.questions
    : undefined;
  const matchingNew = pool
    ? c.mode === "mixed" && pool.mcq_new !== undefined
      ? c.mcq_count === 0
        ? pool.new - pool.mcq_new
        : c.short_count === 0
          ? pool.mcq_new
          : pool.new
      : pool.new
    : undefined;
  const mixedShortfall =
    pool &&
    c.mode === "mixed" &&
    ((pool.mcq_questions ?? Infinity) < c.mcq_count ||
      (pool.short_questions ?? Infinity) < c.short_count);
  const shortfall = available !== null && available > 0 && available < c.target;
  const unit = byMarks ? "marks" : "questions";
  const minutes = estimateMinutes(c);
  const fixes = pool
    ? (
        [
          [
            "Include seen questions",
            pool.any - pool.questions,
            { history: "any" },
          ],
          [
            "All subtopics",
            pool.all_subtopics - pool.any,
            { subtopics: [] as string[] },
          ],
        ] as [string, number, Partial<SetupConfig>][]
      ).filter(([, k]) => k > 0)
    : [];

  return (
    <div className="grid items-start gap-5 pb-[calc(6rem+env(safe-area-inset-bottom))] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {prefilled && (
        <p
          className="text-muted-foreground text-sm xl:col-span-2"
          role="status"
        >
          Prefilled from a link.{" "}
          <button
            type="button"
            className="text-foreground underline"
            onClick={() => {
              setC(prefilled);
              setPrefilled(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-[650] tracking-tight">Build your own</h2>
        </div>
        <div className="space-y-5">
          <div>
            <Section
              title="Topics"
              hint="Choose up to two topics, or practise the whole course."
            >
              <div className="grid items-start gap-3 sm:grid-cols-2">
                {[{ id: "all", name: "All topics" }, ...parents].map((t) => {
                  const on =
                    t.id === "all"
                      ? c.topics.length === 0
                      : c.topics.includes(t.id);
                  const subs = topics.filter((sub) => sub.parent_id === t.id);
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "rounded-2xl border p-3",
                        on && "border-primary ring-primary ring-1",
                      )}
                    >
                      <button
                        type="button"
                        aria-label={t.name}
                        aria-pressed={on}
                        onClick={() => {
                          if (t.id === "all") {
                            set({ topics: [], subtopics: [] });
                            setLimitHit(false);
                          } else toggleTopic(t.id);
                        }}
                        className="focus-visible:outline-ring flex min-h-14 w-full items-start gap-3 rounded-2xl text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "border-input mt-0.5 grid size-5 shrink-0 place-items-center rounded border",
                            on &&
                              "bg-primary border-primary text-primary-foreground",
                          )}
                        >
                          {on && <PortalIcon name="check" className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          {t.name}
                          <span className="text-muted-foreground mt-1 block text-xs font-normal">
                            {n(
                              t.id === "all"
                                ? pool?.questions
                                : pool?.topics[t.id],
                            )}{" "}
                            questions available
                          </span>
                          {t.id !== "all" && (
                            <span className="text-muted-foreground mt-1 block text-xs font-normal tabular-nums">
                              {mastery[t.id] == null
                                ? "Not practised"
                                : `${Math.round(mastery[t.id]!)}% mastery`}
                            </span>
                          )}
                        </span>
                      </button>
                      {on && subs.length > 0 && (
                        <div className="mt-3 space-y-2 border-t pt-3">
                          <h3 className="sr-only">{t.name} subtopics</h3>
                          <p className="text-muted-foreground text-xs">
                            Optional: narrow your practice. No selection uses
                            all subtopics.
                          </p>
                          <div
                            className="flex flex-wrap gap-2"
                            role="group"
                            aria-label={`${t.name} subtopics`}
                          >
                            {subs.map((sub) => (
                              <Chip
                                key={sub.id}
                                on={c.subtopics.includes(sub.id)}
                                disabled={
                                  !!pool && (pool.subtopics[sub.id] ?? 0) === 0
                                }
                                onClick={() =>
                                  set({
                                    subtopics: toggle(c.subtopics, sub.id),
                                  })
                                }
                              >
                                {sub.name}{" "}
                                <span className="tabular-nums opacity-65">
                                  {n(pool?.subtopics[sub.id])}
                                </span>
                              </Chip>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {limitHit && (
                <p role="status" className="text-muted-foreground text-xs">
                  Up to 2 topics. Deselect one first.
                </p>
              )}
            </Section>
          </div>
          <div>
            <Section title="Question type">
              <div
                role="group"
                aria-label="Question type"
                className="grid gap-3 sm:grid-cols-3"
              >
                {Object.entries(modes).map(([id, m]) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={m.label}
                    aria-pressed={c.mode === id}
                    onClick={() => {
                      if (c.mode !== id) setC(withMode(c, id as Mode));
                    }}
                    className={cn(
                      "relative flex flex-col items-start justify-start gap-1 rounded-lg border p-4 text-left transition-colors",
                      c.mode === id
                        ? "border-primary bg-muted ring-primary ring-1"
                        : "hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-4 right-4 grid size-4 place-items-center rounded-full border",
                        c.mode === id && "border-primary",
                      )}
                    >
                      {c.mode === id && (
                        <span className="bg-primary size-2 rounded-full" />
                      )}
                    </span>
                    <PortalIcon
                      name={
                        id === "mcq"
                          ? "list"
                          : id === "short"
                            ? "pen-line"
                            : "layers"
                      }
                      className="text-muted-foreground mb-2 size-5"
                    />
                    <span className="block text-sm font-semibold">
                      {m.label}
                    </span>
                    <span className="text-muted-foreground block text-[13px]">
                      {id === "mcq"
                        ? "Choose from four options."
                        : id === "short"
                          ? "Practise written answers."
                          : "Multiple choice, then short answers."}
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          </div>
          <div>
            <Section
              title="Questions"
              hint={
                c.mode === "mixed"
                  ? "Choose each question count independently. At least 5 questions in total."
                  : undefined
              }
            >
              {written && (
                <div className="space-y-2">
                  <p id="short-marks-label" className="text-sm font-medium">
                    Marks per short answer
                  </p>
                  <div
                    role="group"
                    aria-labelledby="short-marks-label"
                    className="flex flex-wrap gap-2"
                  >
                    {[
                      null,
                      ...Object.keys(pool?.short_mark_values ?? {}).map(Number),
                      ...(c.marks_per_short !== null
                        ? [c.marks_per_short]
                        : []),
                    ]
                      .filter((v, i, all) => all.indexOf(v) === i)
                      .sort((a, b) => (a ?? 0) - (b ?? 0))
                      .map((marks) => (
                        <Chip
                          key={marks ?? "any"}
                          on={c.marks_per_short === marks}
                          onClick={() => set({ marks_per_short: marks })}
                        >
                          {marks === null ? "Any" : `${marks} marks`}
                        </Chip>
                      ))}
                  </div>
                </div>
              )}
              {c.mode === "short" && (
                <ToggleGroup
                  aria-label="Size by"
                  variant="outline"
                  size="sm"
                  value={[c.size_by]}
                  onValueChange={(v) =>
                    v[0] && setC(withSizeBy(c, v[0] as SetupConfig["size_by"]))
                  }
                >
                  <ToggleGroupItem value="marks">Marks</ToggleGroupItem>
                  <ToggleGroupItem value="questions">Questions</ToggleGroupItem>
                </ToggleGroup>
              )}
              {c.mode === "mixed" ? (
                <div className="space-y-3">
                  {(
                    [
                      ["mcq_count", "Multiple choice questions"],
                      ["short_count", "Short answer questions"],
                    ] as const
                  ).map(([key, label]) => (
                    <Stepper
                      key={key}
                      label={label}
                      value={c[key]}
                      min={Math.max(
                        0,
                        5 -
                          c[key === "mcq_count" ? "short_count" : "mcq_count"],
                      )}
                      max={key === "mcq_count" ? 40 : 15}
                      onChange={(value) => setC(withMixedCount(c, key, value))}
                    />
                  ))}
                  <p
                    className="text-muted-foreground text-sm"
                    aria-live="polite"
                  >
                    {c.mcq_count} multis + {c.short_count} shorts = {c.target}{" "}
                    questions
                  </p>
                </div>
              ) : c.mode === "mcq" || !byMarks ? (
                <Stepper
                  label={
                    c.mode === "mcq"
                      ? "Multiple choice questions"
                      : "Short answer questions"
                  }
                  inputLabel="Questions"
                  value={c.target}
                  min={s.min}
                  max={s.max}
                  onChange={(value) => setC(withTarget(c, value))}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Edit total marks in Your sprint.
                </p>
              )}
            </Section>
          </div>
          <div className="space-y-5">
            {(c.history === "prefer_new" || c.history === "any") && (
              <Section title="Question history">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={c.history === "prefer_new"}
                    onCheckedChange={(prefer) =>
                      set({ history: prefer ? "prefer_new" : "any" })
                    }
                  />
                  Prefer questions I haven’t seen
                </label>
              </Section>
            )}

            <div>
              <h2 className="mb-4 text-sm font-semibold">Timer and feedback</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div role="region" aria-label="Timer">
                  <label className="flex items-start gap-3 text-[13px]">
                    <Switch
                      checked={c.timed}
                      onCheckedChange={(timed) =>
                        set({
                          timed,
                          ...(!timed
                            ? {
                                short_min_per_mark: clampPace(
                                  c.short_min_per_mark,
                                ),
                                mcq_min_per_q: clampPace(c.mcq_min_per_q),
                              }
                            : {}),
                        })
                      }
                    />
                    <span>
                      Timed at exam pace
                      <span className="text-muted-foreground mt-0.5 block">
                        {c.timed
                          ? `${minutes} minutes for this sprint`
                          : "No clock. Take your time."}
                      </span>
                    </span>
                  </label>
                  {c.timed && (
                    <div className="mt-3 space-y-3">
                      <div className="grid items-end gap-3 sm:grid-cols-2">
                        {(
                          [
                            ["short_min_per_mark", "Shorts: minutes per mark"],
                            ["mcq_min_per_q", "Multis: minutes per question"],
                          ] as const
                        ).map(([key, label]) => (
                          <label
                            key={key}
                            className="grid gap-1.5 text-sm font-medium"
                          >
                            {label}
                            <Input
                              type="number"
                              min={0.25}
                              max={10}
                              step={0.25}
                              value={c[key] || ""}
                              aria-invalid={!validPace(c[key])}
                              onChange={(e) =>
                                set({ [key]: Number(e.target.value) })
                              }
                              onBlur={() => set({ [key]: clampPace(c[key]) })}
                            />
                          </label>
                        ))}
                      </div>
                      {(!validPace(c.short_min_per_mark) ||
                        !validPace(c.mcq_min_per_q)) && (
                        <p role="alert" className="text-destructive text-sm">
                          <Alert className="mr-1 inline size-4" /> Use a pace
                          between 0.25 and 10 minutes.
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        ≈ {minutes} min
                      </p>
                      <p className="text-muted-foreground text-xs">
                        A sound and banner let you know when time is up. Keep
                        working in overtime until you choose to finish.
                      </p>
                    </div>
                  )}
                </div>
                <div
                  role="region"
                  aria-label="Feedback"
                  className="grid content-start gap-2"
                >
                  <h3 className="text-sm font-medium">How you practise</h3>
                  <RadioGroup
                    aria-label="Feedback"
                    value={c.feedback}
                    onValueChange={(feedback) =>
                      set({ feedback: feedback as SetupConfig["feedback"] })
                    }
                    className="grid gap-2"
                  >
                    {(
                      [
                        [
                          "each",
                          "Check as I go",
                          [
                            "Check each answer when you’re ready.",
                            "See feedback before moving on.",
                          ],
                        ],
                        [
                          "end",
                          "Exam mode",
                          [
                            "Work through questions without feedback.",
                            "See marks and explanations when you finish.",
                          ],
                        ],
                      ] as const
                    ).map(([value, title, points]) => (
                      <label
                        key={value}
                        className={cn(
                          "has-[:focus-visible]:ring-ring flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm has-[:focus-visible]:ring-2",
                          c.feedback === value && "border-primary bg-muted",
                        )}
                      >
                        <RadioGroupItem
                          value={value}
                          aria-labelledby={`${feedbackId}-${value}`}
                          aria-describedby={`${feedbackId}-${value}-help`}
                          className="mt-0.5"
                        />
                        <div className="space-y-2">
                          <span
                            id={`${feedbackId}-${value}`}
                            className="font-medium"
                          >
                            {title}
                          </span>
                          <ul
                            id={`${feedbackId}-${value}-help`}
                            className="text-muted-foreground space-y-1 text-xs"
                          >
                            {points.map((point) => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            </div>
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold">
                <span>
                  Advanced
                  {filtersOn(c) > 0 && (
                    <span className="text-muted-foreground ml-2 font-normal">
                      {filtersOn(c)} {filtersOn(c) === 1 ? "filter" : "filters"}{" "}
                      on
                    </span>
                  )}
                </span>
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-5 pt-4">
                {c.mode === "short" || c.mode === "mixed" ? (
                  <Section
                    title="Difficulty (by marks)"
                    hint="Written questions only."
                  >
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="group"
                      aria-label="Difficulty"
                    >
                      {DIFFICULTY.map(([d, label]) => (
                        <Chip
                          key={d}
                          on={c.difficulty.includes(d)}
                          onClick={() =>
                            set({ difficulty: toggle(c.difficulty, d) })
                          }
                        >
                          {label} ·{" "}
                          {n(pool?.difficulty[d] ?? (pool ? 0 : undefined))}
                        </Chip>
                      ))}
                    </div>
                  </Section>
                ) : null}
                {written && pool && Object.keys(pool.verbs).length > 0 && (
                  <Section title="Directive verb">
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="group"
                      aria-label="Directive verb"
                    >
                      {Object.entries(pool.verbs)
                        .sort((a, b) => b[1] - a[1])
                        .map(([v, k]) => (
                          <Chip
                            key={v}
                            on={c.verbs.includes(v)}
                            onClick={() => set({ verbs: toggle(c.verbs, v) })}
                          >
                            {v} · {k}
                          </Chip>
                        ))}
                    </div>
                  </Section>
                )}
                {pool?.trial && (
                  <Section title="Source">
                    <div
                      className="flex gap-1.5"
                      role="group"
                      aria-label="Source"
                    >
                      {(
                        [
                          ["nesa", "HSC papers"],
                          ["a1", "Practice"],
                        ] as const
                      ).map(([o, label]) => (
                        <Chip
                          key={o}
                          on={c.origins.length === 0 || c.origins.includes(o)}
                          onClick={() => {
                            // Empty = both; never deselect the last one.
                            const next = toggle<"nesa" | "a1">(
                              c.origins.length ? c.origins : ["nesa", "a1"],
                              o,
                            );
                            if (next.length)
                              set({ origins: next.length === 2 ? [] : next });
                          }}
                        >
                          {label}
                        </Chip>
                      ))}
                    </div>
                  </Section>
                )}
                <Section
                  title="Question history"
                  hint="Seen means answered in a finished sprint."
                >
                  <Choice<History>
                    label="Question history"
                    value={c.history}
                    onChange={(history) => set({ history })}
                    options={(
                      [
                        ["prefer_new", "any"],
                        ["new_only", "new"],
                        ["mistakes", "mistakes"],
                        ["flagged", "flagged"],
                        ["any", "any"],
                      ] as const
                    ).map(([h, k]) => [
                      h,
                      <>
                        {HISTORY_LABELS[h]}
                        <span className="text-muted-foreground tabular-nums">
                          · {n(pool?.[k])}
                        </span>
                      </>,
                      !!pool &&
                        h !== "prefer_new" &&
                        h !== "any" &&
                        pool[k] === 0 &&
                        c.history !== h,
                    ])}
                  />
                </Section>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>

      <form
        ref={form}
        action={action}
        onSubmit={(e) => {
          if (
            invalidSize ||
            matching === 0 ||
            pending ||
            (c.timed &&
              (!validPace(c.short_min_per_mark) || !validPace(c.mcq_min_per_q)))
          )
            e.preventDefault();
        }}
        className="bg-card rounded-2xl border p-5 xl:sticky xl:top-20"
      >
        <input type="hidden" name="config" value={JSON.stringify(c)} />
        <div className="grid gap-5">
          <div>
            <h2 className="text-sm font-semibold">Your sprint</h2>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Updates as you build it
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-5">
            <div>
              {byMarks ? (
                <Stepper
                  label="Total marks"
                  inputLabel="Marks"
                  value={c.target}
                  min={s.min}
                  max={s.max}
                  onChange={(value) => setC(withTarget(c, value))}
                />
              ) : (
                <>
                  <p
                    className="num-display text-4xl leading-none font-bold"
                    aria-live="polite"
                  >
                    {c.target}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">{unit}</p>
                </>
              )}
            </div>
            <div>
              <p className="num-display text-4xl leading-none font-bold">
                {c.timed ? minutes : "—"}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                {c.timed ? "minutes" : "untimed"}
              </p>
            </div>
          </div>
          {written && (c.mode === "mixed" || !byMarks) && (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {c.marks_per_short === null
                ? "Estimated total: about "
                : "Total: "}
              {estimatedMarks(c)} marks.
              {c.marks_per_short === null &&
                " Uses 3 marks per short answer; actual marks depend on the questions selected."}
            </p>
          )}
          <dl className="grid gap-2.5 text-[13px]">
            {[
              [
                "Multiple choice",
                c.mode === "short"
                  ? "—"
                  : `${c.mode === "mixed" ? c.mcq_count : c.target} questions`,
              ],
              [
                "Short answer",
                c.mode === "mcq"
                  ? "—"
                  : c.mode === "mixed"
                    ? `${c.short_count} questions`
                    : `${c.target} ${unit}`,
              ],
              [
                "Feedback",
                c.feedback === "end" ? "Exam mode" : "Check as I go",
              ],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-2">
            <p className="text-muted-foreground text-xs">
              {c.subtopics.length
                ? `${c.subtopics.length} dot point${c.subtopics.length === 1 ? "" : "s"}`
                : c.topics.length
                  ? `${c.topics.length} topics`
                  : "Whole course"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {c.topics
                .flatMap((id) => {
                  const subs = c.subtopics.filter(
                    (sub) => topics.find((t) => t.id === sub)?.parent_id === id,
                  );
                  return subs.length ? subs : [id];
                })
                .map((id) => (
                  <Badge key={id} variant="secondary">
                    {names[id]}
                  </Badge>
                ))}
            </div>
          </div>
          <div className="bg-muted min-w-0 space-y-2 rounded-xl p-3.5 text-[13px]">
            <p className="sr-only">{summary(c, names)}</p>
            <div
              className="flex items-baseline justify-between gap-3"
              aria-live="polite"
            >
              {poolError ? (
                <p className="text-muted-foreground">
                  {"Couldn't count matching questions."}
                </p>
              ) : (
                <>
                  <p>
                    <span className="font-semibold tabular-nums">
                      {n(matching)}
                    </span>{" "}
                    questions match
                  </p>
                  <p className="text-muted-foreground tabular-nums">
                    {n(matchingNew)} new to you
                  </p>
                </>
              )}
            </div>
            <Meter
              value={matching ? ((matchingNew ?? 0) / matching) * 100 : 0}
              label="New matching questions"
              className="h-1.5"
            />
          </div>
        </div>
        {(shortfall || mixedShortfall || state.error) && (
          <div className="px-4 pb-3 text-sm">
            {shortfall && c.mode !== "mixed" && (
              <p role="alert" className="text-warning-text">
                <Alert className="mr-1 inline size-4" /> Only {available} {unit}{" "}
                match. Start with {available} {unit} or widen your filters.
              </p>
            )}
            {mixedShortfall && (
              <p role="alert" className="text-warning-text">
                <Alert className="mr-1 inline size-4" /> Only{" "}
                {pool?.mcq_questions} multis and {pool?.short_questions}{" "}
                short-answer questions match. Each bucket uses what is
                available; adjust the split or widen your filters.
              </p>
            )}
            {state.error && (
              <p role="alert" className="text-destructive">
                <Alert className="mr-1 inline size-4" /> Couldn’t start the
                sprint. {state.error}
              </p>
            )}
          </div>
        )}
        <div className="sprint-setup-dock bg-card fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 sm:px-8 md:left-[calc(var(--sidebar-width,0px)-var(--shell-reclaim,0px))]">
          <div className="mx-auto flex max-w-[calc(1400px-4rem)] flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <p className="text-muted-foreground mr-auto min-w-0 truncate text-[13px] tabular-nums">
              <span className="text-foreground font-semibold">
                {c.target} {unit}
              </span>
              <span className="max-sm:hidden">
                {c.timed && ` · ${minutes} min`} · {n(matching)} match
              </span>
            </p>
            <Button
              className="text-muted-foreground"
              type="button"
              variant="ghost"
              onClick={() => {
                setC(DEFAULTS);
              }}
            >
              Reset
            </Button>
            <Button
              className="h-11"
              type="submit"
              disabled={
                invalidSize ||
                pending ||
                matching === 0 ||
                (c.timed &&
                  (!validPace(c.short_min_per_mark) ||
                    !validPace(c.mcq_min_per_q)))
              }
            >
              <PortalIcon name="zap" className="size-4" />
              {pending
                ? "Building…"
                : shortfall
                  ? c.mode === "mixed"
                    ? "Start with available questions"
                    : `Start with ${available} ${unit}`
                  : "Start sprint"}
            </Button>
          </div>
        </div>
      </form>

      {matching === 0 && (
        <EmptyState
          icon={SearchOff}
          title="No questions match"
          description="Widen your filters to build a sprint."
          action={
            fixes.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {fixes.map(([label, k, patch]) => (
                  <Button
                    key={label}
                    variant="outline"
                    size="sm"
                    onClick={() => set(patch)}
                  >
                    {label} (+{k})
                  </Button>
                ))}
              </div>
            )
          }
        />
      )}
    </div>
  );
}
