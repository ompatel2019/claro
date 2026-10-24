"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Alert, SearchOff, PortalIcon } from "@/components/icons";
import { startSprint } from "@/app/(app)/actions";
import { createClient } from "@/utils/supabase/client";
import { modes, type Mode, type Topic } from "@/lib/practice";
import {
  clampPace,
  validPace,
  DEFAULTS,
  estimateMinutes,
  fromParams,
  HISTORY_LABELS,
  restore,
  size,
  summary,
  withMode,
  withTarget,
  withMixedCount,
  withSizeBy,
  type History,
  type Pool,
  type SetupConfig,
} from "@/lib/sprint";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Switch } from "./ui/switch";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

import { Section, Choice, Chip, Stepper } from "./sprint-setup/parts";
export { SameSetup } from "./sprint-setup/starts";

const KEY = "claro.sprint.v1";
const n = (v: number | undefined) => (v === undefined ? "–" : String(v));

/** Every control updates the live pool and the docked summary bar. */
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
  const mixedShortfall =
    pool &&
    c.mode === "mixed" &&
    ((pool.mcq_questions ?? Infinity) < c.mcq_count ||
      (pool.short_questions ?? Infinity) < c.short_count);
  const shortfall = available !== null && available > 0 && available < c.target;
  const unit = byMarks ? "marks" : "questions";
  const minutes = estimateMinutes(c);
  const startLabel = pending
    ? "Building…"
    : shortfall
      ? c.mode === "mixed"
        ? "Start with available questions"
        : `Start with ${available} ${unit}`
      : "Start sprint";
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
    <div className="grid gap-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
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
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-[650] tracking-tight">Build your own</h2>
        </div>
        <div className="space-y-6">
          <div>
            <Section
              title="Topics"
              hint="Choose up to two topics, or practise the whole course."
            >
              <div className="bg-card overflow-hidden rounded-2xl border">
                <div className="text-muted-foreground hidden justify-end border-b px-4 py-2 text-xs sm:flex">
                  Your average
                </div>
                <ul className="divide-y" aria-label="Topics">
                  {[{ id: "all", name: "All topics" }, ...parents].map((t) => {
                    const on =
                      t.id === "all"
                        ? c.topics.length === 0
                        : c.topics.includes(t.id);
                    const subs = topics.filter((sub) => sub.parent_id === t.id);
                    return (
                      <li
                        key={t.id}
                        className={cn("px-4 py-3", on && "bg-selected")}
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
                          className="focus-visible:outline-ring flex w-full items-start gap-3 rounded-lg text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "border-input mt-0.5 grid size-5 shrink-0 place-items-center rounded border",
                              on &&
                                "bg-primary border-primary text-primary-foreground",
                            )}
                          >
                            {on && (
                              <PortalIcon name="check" className="size-4" />
                            )}
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
                          </span>
                          {t.id !== "all" && (
                            <TopicAverage pct={mastery[t.id]} />
                          )}
                        </button>
                        {on && subs.length > 0 && (
                          <div className="mt-3 space-y-2 pl-8">
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
                                    !!pool &&
                                    (pool.subtopics[sub.id] ?? 0) === 0
                                  }
                                  onClick={() =>
                                    set({
                                      subtopics: toggle(c.subtopics, sub.id),
                                    })
                                  }
                                >
                                  {sub.name}{" "}
                                  <span
                                    className={cn(
                                      "tabular-nums",
                                      // Selected chips use Orange Text at full strength for AA contrast.
                                      !c.subtopics.includes(sub.id) &&
                                        "opacity-65",
                                    )}
                                  >
                                    {n(pool?.subtopics[sub.id])}
                                  </span>
                                </Chip>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
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
                        ? "border-primary bg-selected ring-primary ring-1"
                        : "bg-card hover:bg-accent",
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
                <Stepper
                  label="Total marks"
                  inputLabel="Marks"
                  value={c.target}
                  min={s.min}
                  max={s.max}
                  onChange={(value) => setC(withTarget(c, value))}
                />
              )}
            </Section>
          </div>
          <div className="space-y-6">
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
                          c.feedback === value
                            ? "border-primary bg-selected"
                            : "bg-card",
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
          </div>
        </div>
      </div>

      {(shortfall || mixedShortfall || poolError || state.error) && (
        <div className="grid gap-2">
          {poolError && (
            <SetupNotice>Couldn&apos;t count matching questions.</SetupNotice>
          )}
          {shortfall && c.mode !== "mixed" && (
            <SetupNotice>
              Only {available} {unit} match. Start with {available} {unit} or
              widen your filters.
            </SetupNotice>
          )}
          {mixedShortfall && (
            <SetupNotice>
              Only {pool?.mcq_questions} multis and {pool?.short_questions}{" "}
              short-answer questions match. Each bucket uses what is available;
              adjust the split or widen your filters.
            </SetupNotice>
          )}
          {state.error && (
            <p
              role="alert"
              className="bg-card text-destructive flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm"
            >
              <Alert className="mt-0.5 size-4 shrink-0" /> Couldn’t start the
              sprint. {state.error}
            </p>
          )}
        </div>
      )}

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
      >
        <input type="hidden" name="config" value={JSON.stringify(c)} />
        <div
          data-testid="sprint-summary-bar"
          className="sprint-setup-dock bg-card fixed inset-x-0 bottom-0 z-30 rounded-none border-t px-4 py-3 shadow-none sm:px-8 md:left-[calc(var(--sidebar-width,0px)-var(--shell-reclaim,0px))]"
        >
          <p className="sr-only">{summary(c, names)}</p>
          <div className="mx-auto flex max-w-[calc(1400px-4rem)] items-center gap-3">
            <dl
              className="mr-auto flex min-w-0 items-center gap-4 sm:gap-8"
              aria-live="polite"
            >
              {(
                [
                  [byMarks ? "Marks" : "Questions", c.target],
                  ["Minutes", c.timed ? minutes : "—"],
                  [
                    "Matching",
                    poolError ? "–" : n(matching),
                    poolError ? "Couldn't count matching questions" : undefined,
                  ],
                ] as [string, React.ReactNode, string?][]
              ).map(([label, value, title]) => (
                <div
                  key={label}
                  className="flex shrink-0 flex-col"
                  title={title}
                >
                  <dt className="text-muted-foreground order-last text-xs leading-4">
                    {label === "Minutes" && !c.timed ? "Untimed" : label}
                  </dt>
                  <dd className="num-display text-xl leading-6 font-semibold tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <Button
              className="text-muted-foreground shrink-0 max-sm:px-2"
              type="button"
              variant="ghost"
              onClick={() => {
                setC(DEFAULTS);
              }}
            >
              Reset
            </Button>
            <Button
              className="h-11 shrink-0"
              type="submit"
              aria-label={startLabel}
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
              <span className="max-sm:hidden">{startLabel}</span>
              <span className="sm:hidden">
                {pending ? "Building…" : "Start"}
              </span>
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

/** Brand-kit callout: hairline card, Orange Text tone, outline icon. */
function SetupNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="bg-card text-brand-text flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm leading-5"
    >
      <Alert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A topic's real practice average, or "Not practised". */
export function TopicAverage({ pct }: { pct: number | null | undefined }) {
  if (pct == null)
    return (
      <span className="text-muted-foreground shrink-0 self-center text-xs font-normal">
        Not practised
      </span>
    );
  const value = Math.round(Math.max(0, Math.min(100, pct)));
  return (
    <span className="flex shrink-0 items-center gap-3 self-center text-xs">
      <span
        aria-hidden
        className="bg-foreground/10 hidden h-1.5 w-24 overflow-hidden rounded-full sm:block"
      >
        <span
          className="bg-foreground block h-full rounded-full"
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="w-9 text-right font-semibold">{value}%</span>
      <span className="sr-only">average</span>
    </span>
  );
}
