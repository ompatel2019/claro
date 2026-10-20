"use client";
import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Minus,
  Plus,
  SearchOff,
  PortalIcon,
} from "@/components/icons";
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
import { Badge } from "./claro/controls";
import { Meter } from "./claro/data-display";
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

import { Section, Choice, Chip } from "./sprint-setup/parts";
export { QuickStarts, SameSetup } from "./sprint-setup/starts";

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
}: {
  topics: Topic[];
  params: Record<string, string | undefined>;
}) {
  const [c, setC] = useState<SetupConfig>(DEFAULTS);
  const [prefilled, setPrefilled] = useState<SetupConfig | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [poolError, setPoolError] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [customSize, setCustomSize] = useState(false);
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
    <div className="grid items-start gap-5 pb-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
      <Card className="gap-0 py-0">
        <CardContent className="divide-y px-0">
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
                        ? "border-brand bg-brand-soft/60 ring-brand/10 ring-[3px]"
                        : "hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-4 right-4 grid size-4 place-items-center rounded-full border",
                        c.mode === id && "border-brand",
                      )}
                    >
                      {c.mode === id && (
                        <span className="bg-brand size-2 rounded-full" />
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
              title="Topics"
              hint="Pick whole topics or single dot points."
            >
              <div className="-mt-12 mb-4 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    set({ topics: [], subtopics: [] });
                    setLimitHit(false);
                  }}
                >
                  Clear
                </Button>
              </div>
              <div className="grid gap-3">
                {parents.map((t) => {
                  const on = c.topics.includes(t.id);
                  const subs = topics.filter((sub) => sub.parent_id === t.id);
                  const chosen = subs.filter((sub) =>
                    c.subtopics.includes(sub.id),
                  ).length;
                  return (
                    <div key={t.id} className="rounded-xl border p-3.5">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTopic(t.id)}
                        className="flex w-full items-center gap-3 text-left text-sm"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded border",
                            on && "bg-primary text-primary-foreground",
                          )}
                        >
                          {on &&
                            (chosen === 0 || chosen === subs.length ? (
                              <Check className="size-3" />
                            ) : (
                              <Minus className="size-3" />
                            ))}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {t.name}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {on ? chosen || subs.length : 0} of {subs.length}
                        </span>
                      </button>
                      {subs.length > 0 && (
                        <div
                          className="mt-3 flex flex-wrap gap-2 sm:pl-7"
                          role="group"
                          aria-label={`${t.name} subtopics`}
                        >
                          {subs.map((sub) => (
                            <Chip
                              key={sub.id}
                              on={
                                on &&
                                (chosen === 0 || c.subtopics.includes(sub.id))
                              }
                              disabled={
                                !!pool && (pool.subtopics[sub.id] ?? 0) === 0
                              }
                              onClick={() => {
                                if (!on && c.topics.length >= 2) {
                                  setLimitHit(true);
                                  return;
                                }
                                setLimitHit(false);
                                set({
                                  topics:
                                    on &&
                                    chosen === 1 &&
                                    c.subtopics.includes(sub.id)
                                      ? c.topics.filter((id) => id !== t.id)
                                      : on
                                        ? c.topics
                                        : [...c.topics, t.id],
                                  subtopics:
                                    on && chosen === 0
                                      ? [
                                          ...c.subtopics,
                                          ...subs
                                            .filter((s) => s.id !== sub.id)
                                            .map((s) => s.id),
                                        ]
                                      : toggle(c.subtopics, sub.id),
                                });
                              }}
                            >
                              {sub.name}{" "}
                              <span className="opacity-65">
                                {n(pool?.subtopics[sub.id])}
                              </span>
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {limitHit && (
                <p role="status" className="text-warning text-xs">
                  Up to 2 topics. Deselect one first.
                </p>
              )}
            </Section>
          </div>
          <div>
            <Section
              title="Size"
              hint={
                c.mode === "mixed"
                  ? `${c.mcq_count} multiple choice, then ${c.short_marks} marks of short answers.`
                  : `${c.target} ${unit}.`
              }
            >
              <div className="flex flex-wrap gap-2">
                {(c.mode === "mcq" ? [10, 20, 30, 40] : [10, 25, 40, 60]).map(
                  (p) => (
                    <Chip
                      key={p}
                      on={!customSize && c.target === p}
                      onClick={() => {
                        setC(withTarget(c, p));
                        setCustomSize(false);
                      }}
                    >
                      {p} {unit}
                    </Chip>
                  ),
                )}
                <Chip
                  on={customSize}
                  onClick={() => setCustomSize(!customSize)}
                >
                  Custom
                </Chip>
              </div>
              <div hidden={!customSize} className="space-y-3">
                {c.mode === "short" && (
                  <ToggleGroup
                    aria-label="Size by"
                    variant="outline"
                    size="sm"
                    value={[c.size_by]}
                    onValueChange={(v) =>
                      v[0] &&
                      setC(withSizeBy(c, v[0] as SetupConfig["size_by"]))
                    }
                  >
                    <ToggleGroupItem value="marks">Marks</ToggleGroupItem>
                    <ToggleGroupItem value="questions">
                      Questions
                    </ToggleGroupItem>
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
                              setC(
                                withMixedCount(c, key, Number(e.target.value)),
                              )
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
              </div>
            </Section>
          </div>
          <div className="divide-y">
            {
              <Section
                title="Paper years"
                hint="Keep the full range, or narrow it to recent papers."
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {(["year_from", "year_to"] as const).map((k, i) => (
                    <Fragment key={k}>
                      {i === 1 && (
                        <span className="text-muted-foreground text-[13px]">
                          to
                        </span>
                      )}
                      <Select
                        disabled={!years}
                        value={String(c[k] ?? years?.[i] ?? "")}
                        onValueChange={(v) => {
                          const y = {
                            year_from: c.year_from ?? years?.[0],
                            year_to: c.year_to ?? years?.[1],
                            [k]: Number(v),
                          };
                          // From ≤ To: swap rather than reject.
                          const [from, to] = [y.year_from, y.year_to]
                            .filter((v): v is number => v != null)
                            .sort((a, b) => a - b);
                          set({ year_from: from, year_to: to });
                        }}
                      >
                        <SelectTrigger
                          aria-label={i ? "To year" : "From year"}
                          className="w-28"
                        >
                          <SelectValue placeholder="All years" />
                        </SelectTrigger>
                        <SelectContent>
                          {yearList.map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Fragment>
                  ))}

                  {(c.history === "prefer_new" || c.history === "any") && (
                    <label className="ml-auto flex items-center gap-2 text-[13px]">
                      <Switch
                        checked={c.history === "prefer_new"}
                        onCheckedChange={(prefer) =>
                          set({ history: prefer ? "prefer_new" : "any" })
                        }
                      />
                      Prefer questions I haven’t seen
                    </label>
                  )}
                </div>
              </Section>
            }

            <div className="px-5 py-5 sm:px-6">
              <h2 className="mb-4 text-sm font-semibold">Timer and feedback</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div role="region" aria-label="Timer">
                  <label className="flex items-start gap-3 rounded-xl border p-3.5 text-[13px]">
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
                  {customSize && c.timed && (
                    <details>
                      <summary className="text-muted-foreground cursor-pointer text-xs">
                        Adjust exam pace
                      </summary>
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(
                            [
                              [
                                "short_min_per_mark",
                                "Shorts: minutes per mark",
                              ],
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
                      </div>
                    </details>
                  )}
                </div>
                <div
                  role="region"
                  aria-label="Feedback"
                  className="grid content-start gap-2 rounded-xl border p-3.5"
                >
                  <h3 className="text-sm font-medium">Show feedback</h3>
                  <RadioGroup
                    aria-label="Feedback"
                    value={c.feedback}
                    onValueChange={(feedback) =>
                      set({ feedback: feedback as SetupConfig["feedback"] })
                    }
                    className="bg-muted flex gap-0.5 rounded-full p-0.5"
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
                    )
                      .slice()
                      .reverse()
                      .map(([value, title, points]) => (
                        <label
                          key={value}
                          className={cn(
                            "has-[:focus-visible]:ring-ring relative flex cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-1.5 text-xs whitespace-nowrap has-[:focus-visible]:ring-2",
                            c.feedback === value && "bg-card shadow-xs",
                          )}
                        >
                          <RadioGroupItem
                            value={value}
                            aria-label={title}
                            className="sr-only"
                          />
                          <div className="space-y-2">
                            <span className="font-medium">
                              {value === "end"
                                ? "At the end"
                                : "After each question"}
                            </span>
                            <ul className="sr-only">
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
            <Collapsible
              className={cn(
                "px-5 py-5 sm:px-6",
                !customSize && filtersOn(c) === 0 && "hidden",
              )}
            >
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
        </CardContent>
      </Card>

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
        className="bg-card shadow-card rounded-xl border p-5 xl:sticky xl:top-20"
      >
        <input type="hidden" name="config" value={JSON.stringify(c)} />
        <div className="grid gap-5">
          <div>
            <h2 className="text-sm font-semibold">Your sprint</h2>
            <p className="text-muted-foreground mt-1 text-[13px]">
              Updates as you build it
            </p>
          </div>
          <div className="flex items-end gap-8">
            <div>
              <p className="text-4xl leading-none font-bold tracking-tight">
                {c.target}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">{unit}</p>
            </div>
            <div>
              <p className="text-4xl leading-none font-bold tracking-tight">
                {c.timed ? minutes : "—"}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                {c.timed ? "minutes" : "untimed"}
              </p>
            </div>
          </div>
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
                    ? `${c.short_marks} marks`
                    : `${c.target} ${unit}`,
              ],
              [
                "Paper years",
                years
                  ? `${c.year_from ?? years?.[0]}–${c.year_to ?? years?.[1]}`
                  : "All years",
              ],
              [
                "Feedback",
                c.feedback === "end" ? "At the end" : "After each question",
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
            <p className="sr-only">{summary(c, names, years)}</p>
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
          <Button
            className="text-muted-foreground order-last -mt-4 h-8 w-full text-xs"
            type="button"
            variant="ghost"
            onClick={() => {
              setC(DEFAULTS);
            }}
          >
            Reset
          </Button>
          <Button
            className="h-11 w-full"
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
