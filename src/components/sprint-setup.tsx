"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, Minus, Plus, SearchOff } from "@/components/icons";
import { startSprint } from "@/app/(app)/actions";
import { createClient } from "@/utils/supabase/client";
import { modes, type Mode, type Topic } from "@/lib/practice";
import {
  clampPace,
  validPace,
  DEFAULTS,
  estimateMinutes,
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
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Input } from "./ui/input";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const KEY = "claro.sprint.v1";
const DIFFICULTY: [Difficulty, string][] = [
  ["foundation", "Foundation · 1–3 marks"],
  ["standard", "Standard · 4–5 marks"],
  ["challenging", "Challenging · 6+ marks"],
];
const n = (v: number | undefined) => (v === undefined ? "–" : String(v));

function Section({
  title,
  children,
  hint,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, React.ReactNode, boolean?][];
  onChange: (v: T) => void;
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(v) => onChange(v as T)}
    >
      {options.map(([v, text, disabled]) => (
        <label
          key={v}
          className={cn(
            "flex items-center gap-2 text-sm",
            disabled && "text-muted-foreground",
          )}
        >
          <RadioGroupItem value={v} disabled={disabled} />
          {text}
        </label>
      ))}
    </RadioGroup>
  );
}

/** §3.2 Topic Sprint setup: every control updates the live pool; the bar is the confirmation. */
export function SprintSetup({
  topics,
  params,
}: {
  topics: Topic[];
  params: Record<string, string | undefined>;
}) {
  const [step, setStep] = useState(0);
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
        if (step === 3) form.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

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
      subtopics: c.subtopics.filter((s) => !s.startsWith(`${id}-`)),
    });
  }

  const s = size(c);
  const invalidSize = c.target < s.min || c.target > s.max;
  const written = c.mode === "short" || c.mode === "mixed";
  const byMarks = c.size_by === "marks";
  const available = pool
    ? c.mode === "mixed" &&
      pool.mcq_questions !== undefined &&
      pool.short_marks !== undefined
      ? Math.min(c.mcq_count, pool.mcq_questions) +
        Math.min(c.short_marks, pool.short_marks)
      : byMarks
        ? pool.marks
        : pool.questions
    : null;
  const matching = pool
    ? c.mode === "mixed" && pool.mcq_questions !== undefined
      ? c.mcq_count === 0
        ? pool.questions - pool.mcq_questions
        : c.short_marks === 0
          ? pool.mcq_questions
          : pool.questions
      : pool.questions
    : undefined;
  const matchingNew = pool
    ? c.mode === "mixed" && pool.mcq_new !== undefined
      ? c.mcq_count === 0
        ? pool.new - pool.mcq_new
        : c.short_marks === 0
          ? pool.mcq_new
          : pool.new
      : pool.new
    : undefined;
  const mixedShortfall =
    pool &&
    c.mode === "mixed" &&
    ((pool.mcq_questions ?? Infinity) < c.mcq_count ||
      (pool.short_marks ?? Infinity) < c.short_marks);
  const shortfall = available !== null && available > 0 && available < c.target;
  const unit = byMarks ? "marks" : "questions";
  const minutes = estimateMinutes(c);
  const years = pool?.years ?? null;
  const yearList = years
    ? Array.from({ length: years[1] - years[0] + 1 }, (_, i) => years[0] + i)
    : [];
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
          [
            "All years",
            pool.all_years - pool.any,
            { year_from: null, year_to: null },
          ],
        ] as [string, number, Partial<SetupConfig>][]
      ).filter(([, k]) => k > 0)
    : [];

  return (
    <div className="mx-auto max-w-[720px] space-y-4 pb-8">
      {prefilled && (
        <p className="text-muted-foreground text-sm" role="status">
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
      <ol
        aria-label="Sprint setup progress"
        className="grid grid-cols-4 gap-2 text-xs"
      >
        {["Question type", "Topics", "Size", "Timer & feedback"].map(
          (label, i) => (
            <li
              key={label}
              aria-current={step === i ? "step" : undefined}
              className={cn(
                "border-t-2 pt-2",
                i <= step
                  ? "border-primary text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span className="block font-semibold">{i + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      <p role="status" className="text-muted-foreground text-sm">
        Step {step + 1} of 4
      </p>
      <Card>
        <CardContent className="space-y-7">
          <div hidden={step !== 0}>
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
                      "min-h-28 rounded-xl border p-4 text-left transition-colors",
                      c.mode === id
                        ? "border-primary bg-accent"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="block font-semibold">{m.label}</span>
                    <span className="text-muted-foreground mt-2 block text-xs">
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
          <div
            hidden={step !== 1}
            className={step === 1 ? "space-y-7" : undefined}
          >
            <Section
              title="Topics"
              hint="Up to 2. None selected practises the whole course."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {parents.map((t) => {
                  const on = c.topics.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleTopic(t.id)}
                      className={cn(
                        "rounded-xl border p-3 text-left text-sm transition-colors",
                        on ? "border-primary bg-accent" : "hover:bg-muted",
                      )}
                    >
                      <span className="block font-medium">{t.name}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {n(pool?.topics[t.id] ?? (pool ? 0 : undefined))}{" "}
                        questions
                      </span>
                    </button>
                  );
                })}
              </div>
              {limitHit && (
                <p role="status" className="text-warning text-xs">
                  Up to 2 topics. Deselect one first.
                </p>
              )}
            </Section>

            {c.topics.length > 0 && (
              <Section
                title="Subtopics"
                hint="None selected covers the whole topic."
              >
                {c.topics.map((p) => {
                  const subs = topics.filter((t) => t.parent_id === p);
                  const chosen = c.subtopics.filter((x) =>
                    x.startsWith(`${p}-`),
                  );
                  return (
                    <div key={p} className="space-y-1.5">
                      <p className="text-muted-foreground text-xs">
                        {names[p]}
                      </p>
                      <div
                        className="flex flex-wrap gap-1.5"
                        role="group"
                        aria-label={`${names[p]} subtopics`}
                      >
                        <Chip
                          on={chosen.length === 0}
                          onClick={() =>
                            set({
                              subtopics: c.subtopics.filter(
                                (x) => !x.startsWith(`${p}-`),
                              ),
                            })
                          }
                        >
                          All
                        </Chip>
                        {subs.map((t) => {
                          const count = pool?.subtopics[t.id] ?? 0;
                          return (
                            <Chip
                              key={t.id}
                              on={c.subtopics.includes(t.id)}
                              disabled={!!pool && count === 0}
                              onClick={() =>
                                set({ subtopics: toggle(c.subtopics, t.id) })
                              }
                            >
                              {t.name} · {pool ? count : "–"}
                            </Chip>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </Section>
            )}
          </div>
          <div hidden={step !== 2}>
            <Section title="Size">
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Decrease"
                  onClick={() => setC(withTarget(c, c.target - s.step))}
                >
                  <Minus />
                </Button>
                <Input
                  aria-label={byMarks ? "Marks" : "Questions"}
                  inputMode="numeric"
                  className="w-16 text-center tabular-nums"
                  value={c.target}
                  onChange={(e) =>
                    /^\d*$/.test(e.target.value) &&
                    setC({
                      ...c,
                      target: Number(e.target.value) || 0,
                      mcq_count: Math.ceil(Number(e.target.value) / 2),
                      short_marks: Math.floor(Number(e.target.value) / 2),
                    })
                  }
                  aria-describedby="sprint-size-hint"
                  aria-invalid={invalidSize}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Increase"
                  onClick={() => setC(withTarget(c, c.target + s.step))}
                >
                  <Plus />
                </Button>
                <span className="text-muted-foreground text-sm">
                  {unit} ({s.min}–{s.max})
                </span>
                <div className="flex gap-1">
                  {s.presets.map((p) => (
                    <Chip
                      key={p}
                      on={c.target === p}
                      onClick={() => setC(withTarget(c, p))}
                    >
                      {p}
                    </Chip>
                  ))}
                </div>
              </div>
              <p
                id="sprint-size-hint"
                className="text-muted-foreground text-xs"
                aria-live="polite"
              >
                {invalidSize
                  ? `Enter ${s.min}–${s.max} ${unit} to continue.`
                  : `Minimum ${s.min} ${unit}; maximum ${s.max}.`}
              </p>
              {c.mode === "mixed" && (
                <div className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["mcq_count", "Multiple choice questions"],
                        ["short_marks", "Short answer marks"],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="grid gap-1.5 text-sm font-medium"
                      >
                        {label}
                        <Input
                          type="number"
                          min={0}
                          max={c.target}
                          step={1}
                          value={c[key]}
                          onChange={(e) =>
                            setC(withMixedCount(c, key, Number(e.target.value)))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p
                    className="text-muted-foreground text-sm"
                    aria-live="polite"
                  >
                    {c.mcq_count} multis + {c.short_marks} marks of shorts ={" "}
                    {c.target} marks
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Shorts use whole questions and aim within 2 marks of the
                    target.
                  </p>
                </div>
              )}
            </Section>
          </div>
          <div
            hidden={step !== 3}
            className={step === 3 ? "space-y-7" : undefined}
          >
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
                {years && (
                  <Section title="Years">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {(["year_from", "year_to"] as const).map((k, i) => (
                        <Select
                          key={k}
                          value={String(c[k] ?? years[i])}
                          onValueChange={(v) => {
                            const y = {
                              year_from: c.year_from ?? years[0],
                              year_to: c.year_to ?? years[1],
                              [k]: Number(v),
                            };
                            // From ≤ To: swap rather than reject.
                            const [from, to] = [y.year_from, y.year_to].sort();
                            set({ year_from: from, year_to: to });
                          }}
                        >
                          <SelectTrigger
                            aria-label={i ? "To year" : "From year"}
                            className="w-24"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {yearList.map((y) => (
                              <SelectItem key={y} value={String(y)}>
                                {y}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ))}
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          set({ year_from: years[1] - 4, year_to: years[1] })
                        }
                      >
                        Last 5 years
                      </button>
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
                          {" "}
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

            <Section title="Timer">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={c.timed}
                  onCheckedChange={(timed) =>
                    set({
                      timed,
                      ...(!timed
                        ? {
                            short_min_per_mark: clampPace(c.short_min_per_mark),
                            mcq_min_per_q: clampPace(c.mcq_min_per_q),
                          }
                        : {}),
                    })
                  }
                />
                Timed
              </label>
              {c.timed && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                      Use a pace between 0.25 and 10 minutes.
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    ≈ {minutes} min
                  </p>
                  <p className="text-muted-foreground text-xs">
                    A sound and banner let you know when time is up. Keep
                    working in overtime until you choose to finish.
                  </p>
                </>
              )}
            </Section>

            <Section title="Feedback">
              <RadioGroup
                aria-label="Feedback"
                value={c.feedback}
                onValueChange={(feedback) =>
                  set({ feedback: feedback as SetupConfig["feedback"] })
                }
                className="grid gap-3 sm:grid-cols-2"
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
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm",
                      c.feedback === value && "border-primary bg-accent",
                    )}
                  >
                    <RadioGroupItem
                      value={value}
                      aria-label={title}
                      className="mt-1"
                    />
                    <div className="space-y-2">
                      <span className="font-medium">{title}</span>
                      <ul className="text-muted-foreground list-disc space-y-1 pl-4">
                        {points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </Section>
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
            {step < 3 && (
              <Button type="button" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
            {step === 3 && (
              <p className="text-muted-foreground text-xs">
                Ready? Start your sprint below.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <form
        ref={form}
        action={action}
        onSubmit={(e) => {
          if (
            invalidSize ||
            step !== 3 ||
            matching === 0 ||
            pending ||
            (c.timed &&
              (!validPace(c.short_min_per_mark) || !validPace(c.mcq_min_per_q)))
          )
            e.preventDefault();
        }}
        className="bg-background rounded-2xl border"
      >
        <input type="hidden" name="config" value={JSON.stringify(c)} />
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="w-full min-w-0 text-sm sm:w-auto sm:flex-1">
            <p className="font-medium text-pretty">
              {summary(c, names, years)}
            </p>
            <p
              className="text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {poolError
                ? "Couldn't count matching questions."
                : `${n(matching)} questions match · ${n(matchingNew)} new`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setC(DEFAULTS);
              setStep(0);
            }}
          >
            Reset
          </Button>
          <Button
            type="submit"
            disabled={
              invalidSize ||
              step !== 3 ||
              pending ||
              matching === 0 ||
              (c.timed &&
                (!validPace(c.short_min_per_mark) ||
                  !validPace(c.mcq_min_per_q)))
            }
          >
            {pending
              ? "Building…"
              : shortfall
                ? c.mode === "mixed"
                  ? "Start with available questions"
                  : `Start with ${available} ${unit}`
                : "Start sprint"}
          </Button>
        </div>
        {(shortfall || mixedShortfall || state.error) && (
          <div className="px-4 pb-3 text-sm">
            {shortfall && c.mode !== "mixed" && (
              <p role="alert" className="text-warning">
                Only {available} {unit} match. Start with {available} {unit} or
                widen your filters.
              </p>
            )}
            {mixedShortfall && (
              <p role="alert" className="text-warning">
                Only {pool?.mcq_questions} multis and {pool?.short_marks} marks
                of shorts match. Each bucket uses what is available; adjust the
                split or widen your filters.
              </p>
            )}
            {state.error && (
              <p role="alert" className="text-destructive">
                Couldn’t start the sprint. {state.error}
              </p>
            )}
          </div>
        )}
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

function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-left text-xs font-medium transition-colors disabled:opacity-40",
        on ? "border-primary bg-accent" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

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
export function QuickStarts() {
  const [state, action, pending] = useActionState(startSprint, {});
  return (
    <form action={action} className="contents">
      {QUICK.map((q) => (
        <Button
          key={q.label}
          name="config"
          value={JSON.stringify(q.config)}
          type="submit"
          variant="outline"
          className="justify-start"
          disabled={pending}
        >
          {q.label}
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
