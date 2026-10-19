"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { startFlashcards } from "@/app/(app)/flashcards/actions";
import {
  clampDeckSize,
  deckCounts,
  DECK_DEFAULTS,
  restoreDeck,
  type DeckCard,
  type DeckConfig,
  type DeckHistory,
} from "@/lib/deck";
import { plural, type Topic } from "@/lib/practice";
import { SearchOff, PortalIcon } from "@/components/icons";
import { EmptyState } from "./empty-state";
import { Button, Chip } from "./claro/controls";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./ui/card";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const KEY = "claro.flashcards.v1";
function Options({
  title,
  value,
  description,
  showReasons = false,
  options,
  onChange,
}: {
  title: string;
  description?: React.ReactNode;
  showReasons?: boolean;
  value: string;
  options: {
    value: string;
    label: string;
    disabled?: boolean;
    reason?: string;
  }[];
  onChange: (value: string) => void;
}) {
  return (
    <section className="grid gap-3 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center sm:gap-6 sm:px-6">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && (
          <div className="text-muted-foreground text-[13px]">{description}</div>
        )}
      </div>
      <div className="min-w-0">
        <ToggleGroup
          size="default"
          aria-label={title}
          variant={
            title === "Mode" || title === "Answer by" ? "default" : "outline"
          }
          className={
            title === "Mode" || title === "Answer by"
              ? "max-w-full flex-wrap"
              : "max-w-full flex-wrap gap-2 rounded-none bg-transparent p-0"
          }
          value={[value]}
          onValueChange={(v) => v[0] && onChange(v[0])}
        >
          {options.map((o) => (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              aria-label={o.label}
              disabled={o.disabled}
              title={o.reason}
              className={
                title === "Mode" || title === "Answer by"
                  ? ""
                  : "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary"
              }
            >
              {title === "Answer by" && o.value !== "either" && (
                <PortalIcon
                  name={o.value === "typing" ? "keyboard" : "mic"}
                  className="size-3.5"
                />
              )}
              {o.label.replace(/\s*\(\d+\)/g, "")}
              {/\((\d+)\)/.test(o.label) && (
                <span className="text-muted-foreground">
                  {o.label.match(/\((\d+)\)/)?.[1]}
                </span>
              )}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {options
          .filter(
            (o) => o.disabled && o.reason && (value === o.value || showReasons),
          )
          .map((o) => (
            <p key={o.value} className="text-muted-foreground text-xs">
              {o.reason}
            </p>
          ))}
      </div>
    </section>
  );
}
export function FlashcardBuilder({
  cards,
  topics,
  history,
  topic,
  defaults = DECK_DEFAULTS,
}: {
  cards: DeckCard[];
  topics: Topic[];
  history: DeckHistory;
  topic?: string;
  defaults?: DeckConfig;
}) {
  const [c, setC] = useState<DeckConfig>(defaults);
  const [customSize, setCustomSize] = useState("20");
  const [custom, setCustom] = useState(false);
  const [speech, setSpeech] = useState(false);
  const [state, action, pending] = useActionState(startFlashcards, {});
  const ready = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let saved = defaults;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) saved = restoreDeck(JSON.parse(raw));
    } catch {}
    const hasSpeech =
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
    if (!hasSpeech && saved.answer_by === "speaking")
      saved = { ...saved, answer_by: "either" };
    const selected = topics.find((t) => t.id === topic);
    if (selected)
      saved = {
        ...saved,
        topics: [selected.parent_id ?? selected.id],
        subtopics: selected.parent_id ? [selected.id] : [],
      };
    // Browser preferences and capabilities are available only after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setC(saved);
    setCustom(
      typeof saved.size === "number" && ![10, 20, 30, 50].includes(saved.size),
    );
    setCustomSize(String(saved.size === "all" ? 20 : saved.size));
    setSpeech(hasSpeech);
    ready.current = true;
  }, [topic, topics, defaults]);
  useEffect(() => {
    if (ready.current) {
      try {
        localStorage.setItem(KEY, JSON.stringify(c));
      } catch {}
    }
  }, [c]);
  const counts = deckCounts(cards, c, history);
  const customNumber = clampDeckSize(
    customSize === "" ? 20 : Number(customSize),
    200,
  );
  const size = clampDeckSize(custom ? customNumber : c.size, counts.total);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,[contenteditable=true]")
        )
      ) {
        e.preventDefault();
        if (size > 0 && !pending) form.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [size, pending]);
  const set = (patch: Partial<DeckConfig>) =>
    setC((prev) => ({ ...prev, ...patch }));
  const selectedNames = (
    c.topics.length
      ? c.topics.flatMap((parent) => {
          const subs = c.subtopics.filter((id) => id.startsWith(`${parent}-`));
          return subs.length ? subs : [parent];
        })
      : c.subtopics
  )
    .map((id) => topics.find((t) => t.id === id)?.name)
    .filter(Boolean);
  const names = selectedNames.length
    ? `${selectedNames.slice(0, 2).join(", ")}${selectedNames.length > 2 ? ` +${selectedNames.length - 2} more` : ""}`
    : "All";
  const mine = cards.filter((card) => card.owner_id === history.userId).length;
  const kinds = c.kinds.length === 2 ? "both" : c.kinds[0];
  const sizeValue = custom ? "custom" : String(c.size);
  const toggleSubtopic = (id: string, parent: string) => {
    const subtopics = c.subtopics.includes(id)
      ? c.subtopics.filter((s) => s !== id)
      : [...c.subtopics, id];
    set({
      topics: subtopics.some((s) => s.startsWith(`${parent}-`))
        ? c.topics.includes(parent)
          ? c.topics
          : [...c.topics, parent]
        : c.topics.filter((p) => p !== parent),
      subtopics,
    });
  };
  return (
    <div className="contents">
      <Card className="gap-0 py-0 xl:col-span-2">
        <CardHeader className="relative border-b py-4">
          <CardTitle>Build a custom deck</CardTitle>
          <CardDescription>Or skip this and review what’s due.</CardDescription>
          <details className="group col-span-full">
            <summary
              aria-label="More deck options"
              title="More deck options"
              className="text-muted-foreground hover:bg-accent absolute top-4 right-4 grid size-8 cursor-pointer list-none place-items-center rounded-full"
            >
              <PortalIcon name="ellipsis" />
            </summary>
            <section className="space-y-4 px-5 pb-4 sm:px-6">
              <h2 className="text-sm font-medium">Subtopics</h2>
              <p className="text-muted-foreground text-xs">
                None selected covers the whole course.
              </p>
              {topics
                .filter((t) => !t.parent_id)
                .map((parent) => (
                  <div key={parent.id} className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      {parent.name} · {counts.topics[parent.id] ?? 0}
                    </h3>
                    <ToggleGroup
                      multiple
                      size="default"
                      aria-label={`${parent.name} subtopics`}
                      className="max-w-full flex-wrap gap-2 rounded-none bg-transparent p-0"
                      variant="outline"
                      value={
                        c.subtopics.filter((id) =>
                          id.startsWith(`${parent.id}-`),
                        ).length
                          ? c.subtopics
                          : c.topics.includes(parent.id)
                            ? ["all"]
                            : []
                      }
                    >
                      <ToggleGroupItem
                        value="all"
                        disabled={!counts.topics[parent.id]}
                        onClick={() =>
                          set({
                            topics:
                              c.topics.includes(parent.id) &&
                              !c.subtopics.some((id) =>
                                id.startsWith(`${parent.id}-`),
                              )
                                ? c.topics.filter((id) => id !== parent.id)
                                : c.topics.includes(parent.id)
                                  ? c.topics
                                  : [...c.topics, parent.id],
                            subtopics: c.subtopics.filter(
                              (id) => !id.startsWith(`${parent.id}-`),
                            ),
                          })
                        }
                      >
                        All
                      </ToggleGroupItem>
                      {topics
                        .filter((t) => t.parent_id === parent.id)
                        .map((t) => (
                          <ToggleGroupItem
                            key={t.id}
                            value={t.id}
                            disabled={!counts.subtopics[t.id]}
                            onClick={() => toggleSubtopic(t.id, parent.id)}
                          >
                            {t.name} · {counts.subtopics[t.id] ?? 0}
                          </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                  </div>
                ))}
            </section>
            <Options
              title="Which cards"
              value={c.which}
              options={(
                [
                  ["all", "All matching"],
                  ["due", "Due"],
                  ["new", "New, never reviewed"],
                  ["missed", "Missed last time"],
                ] as const
              ).map(([value, label]) => ({
                value,
                label: `${label} (${counts.which[value]})`,
                disabled: counts.which[value] === 0,
              }))}
              onChange={(which) => set({ which: which as DeckConfig["which"] })}
            />
            <Options
              title="Order"
              value={c.order}
              options={[
                { value: "shuffled", label: "Shuffled" },
                { value: "topic", label: "By topic" },
              ]}
              onChange={(order) => set({ order: order as DeckConfig["order"] })}
            />
            <label className="flex items-center gap-2 px-5 py-4 text-sm sm:px-6">
              <Switch
                checked={c.repeat_missed}
                onCheckedChange={(repeat_missed) => set({ repeat_missed })}
              />
              Repeat missed cards
            </label>
          </details>
        </CardHeader>
        <CardContent className="divide-y px-0">
          <Options
            title="Mode"
            description={
              c.mode === "study"
                ? "Type or say your answer, then flip and rate yourself."
                : "Type or say it, we check it."
            }
            value={c.mode}
            options={[
              { value: "study", label: "Study" },
              { value: "test", label: "Test" },
            ]}
            onChange={(mode) => set({ mode: mode as DeckConfig["mode"] })}
          />
          <Options
            title="Deck size"
            description={
              <p role="status">
                {size} of {plural(counts.total, "card")}
              </p>
            }
            value={sizeValue}
            options={[10, 20, 30, 50]
              .map((n) => ({ value: String(n), label: String(n) }))
              .concat([
                { value: "all", label: `All (${counts.total})` },
                { value: "custom", label: "Custom" },
              ])}
            onChange={(value) => {
              setCustom(value === "custom");
              if (value !== "custom")
                set({ size: value === "all" ? "all" : Number(value) });
              else setCustomSize(String(c.size === "all" ? 20 : c.size));
            }}
          />
          {custom && (
            <Input
              aria-label="Custom deck size"
              type="number"
              min={1}
              max={200}
              className="mx-5 my-3 w-24"
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              onBlur={() => {
                setCustomSize(String(customNumber));
                set({ size: customNumber });
              }}
            />
          )}
          <Options
            title="Answer by"
            showReasons={c.mode === "test"}
            value={c.answer_by}
            options={[
              { value: "typing", label: "Typing" },
              {
                value: "speaking",
                label: "Speaking",
                disabled: !speech,
                reason: !speech
                  ? "Speech input is not available in this browser."
                  : undefined,
              },
              { value: "either", label: "Either" },
            ]}
            onChange={(answer_by) =>
              set({ answer_by: answer_by as DeckConfig["answer_by"] })
            }
          />
          <Options
            title="Card type"
            value={kinds}
            options={[
              {
                value: "term",
                label: `Terms (${counts.kinds.term})`,
                disabled: counts.kinds.term === 0,
              },
              {
                value: "stat",
                label: `Stats (${counts.kinds.stat})`,
                disabled: counts.kinds.stat === 0,
              },
              { value: "both", label: `Both (${counts.kinds.both})` },
            ]}
            onChange={(kind) =>
              set({
                kinds:
                  kind === "both"
                    ? ["term", "stat"]
                    : [kind as "term" | "stat"],
              })
            }
          />
          <Options
            title="Source"
            value={c.source}
            options={[
              { value: "claro", label: `Claro cards (${counts.source.claro})` },
              {
                value: "my",
                label: `My cards (${counts.source.my})`,
                disabled: counts.source.my === 0,
                reason:
                  counts.source.my === 0
                    ? mine === 0
                      ? "Make your own in My cards"
                      : "No My cards match these filters."
                    : undefined,
              },
              { value: "both", label: `Both (${counts.source.both})` },
            ]}
            onChange={(source) =>
              set({ source: source as DeckConfig["source"] })
            }
          />
          <section className="grid gap-3 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6 sm:px-6">
            <div>
              <h2 className="text-sm font-medium">Topics</h2>
              <p className="text-muted-foreground text-[13px]">
                {names === "All" ? "All topics" : names}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {topics
                .filter((t) => !t.parent_id)
                .map((parent) => (
                  <Chip
                    key={parent.id}
                    pressed={c.topics.includes(parent.id)}
                    disabled={!counts.topics[parent.id]}
                    onPressedChange={() =>
                      set({
                        topics: c.topics.includes(parent.id)
                          ? c.topics.filter((id) => id !== parent.id)
                          : [...c.topics, parent.id],
                        subtopics: c.subtopics.filter(
                          (id) => !id.startsWith(`${parent.id}-`),
                        ),
                      })
                    }
                  >
                    {parent.name}
                  </Chip>
                ))}
            </div>
          </section>
        </CardContent>
      </Card>
      <form
        ref={form}
        action={action}
        onSubmit={() => {
          if (custom) {
            setCustomSize(String(customNumber));
            set({ size: customNumber });
          }
        }}
        className="bg-card shadow-card grid gap-5 rounded-xl border py-5 xl:sticky xl:top-20"
      >
        <input
          type="hidden"
          name="config"
          value={JSON.stringify(custom ? { ...c, size: customNumber } : c)}
        />
        {counts.total === 0 && (
          <EmptyState
            icon={SearchOff}
            title="No cards match"
            description="Widen your selection to build a deck."
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => set({ topics: [], subtopics: [] })}
                >
                  Include all topics
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    set({
                      which: "all",
                      source: "both",
                      kinds: ["term", "stat"],
                    })
                  }
                >
                  All cards
                </Button>
              </div>
            }
          />
        )}
        <div className="px-5">
          <h2 className="text-[15px] font-semibold">Your deck</h2>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Updates as you build it
          </p>
        </div>
        <div className="px-5">
          <p className="text-[36px] leading-none font-bold tracking-[-0.04em]">
            {size}
          </p>
          <p className="text-muted-foreground mt-1.5 text-xs">
            cards
            {size > 0 &&
              ` · about ${plural(Math.max(1, Math.round(size * 0.33)), "minute")}`}
          </p>
        </div>
        <dl className="grid gap-2.5 px-5 text-[13px]">
          {[
            ["Mode", c.mode === "study" ? "Study" : "Test"],
            [
              "Answer by",
              c.answer_by === "either"
                ? "Typing or speaking"
                : c.answer_by === "typing"
                  ? "Typing"
                  : "Speaking",
            ],
            [
              "Card type",
              kinds === "both"
                ? "Terms and stats"
                : kinds === "term"
                  ? "Terms"
                  : "Stats",
            ],
            [
              "Source",
              c.source === "both"
                ? "Claro and mine"
                : c.source === "my"
                  ? "My cards"
                  : "Claro cards",
            ],
            ["Topics", names],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-1.5 px-5">
          <Button
            type="submit"
            disabled={size === 0 || pending}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            className="h-11 w-full"
            aria-label="Start"
          >
            <PortalIcon name="play" />
            {pending ? "Building…" : "Start deck"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground w-full"
            onClick={() => {
              setC(defaults);
              setCustom(false);
              setCustomSize("20");
            }}
          >
            Reset
          </Button>
        </div>
        {state.error && (
          <p role="alert" className="text-destructive w-full px-5 text-sm">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
