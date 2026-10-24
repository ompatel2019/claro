"use client";
import { Fragment, useEffect, useState } from "react";
import type { McGridRow } from "@/lib/results";
import {
  RESULT_ICON,
  RESULT_LEGEND,
  RESULT_OPEN,
  RESULT_SWATCH,
  RESULT_TILE,
  RESULT_WORD,
  type AnswerPillState,
} from "@/lib/answer-pill";
import { TRACKER_STATE } from "./sprint/tracker-state";
import { Check, Close, PortalIcon } from "./icons";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { cn } from "@/lib/utils";
import { isTyping } from "./session-shell";
import { StatusPill, type Pill } from "./status-pill";
import { Toggle } from "./ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

export type ResultItem = {
  position?: number;
  type: string;
  topic: string;
  source: string;
  mark: string | null;
  tone: string;
  pill: Pill | null;
  /** Sprint results tiles and table use the result states. */
  state?: AnswerPillState;
  /** Flagged during the sprint: a tracker flag dot on the pill. */
  flagged?: boolean;
};

/** §3.4 question strip (or compact table) and the selected question; J / K move between questions. */
export function ResultsBrowser({
  items,
  views,
  actions,
  initial,
  mcGrid,
  sprintLayout = false,
}: {
  items: ResultItem[];
  views: React.ReactNode[];
  /** Sprint layout: each question's actions row, shown above its card. */
  actions?: React.ReactNode[];
  initial: number;
  mcGrid?: McGridRow[];
  sprintLayout?: boolean;
}) {
  const [index, setIndex] = useState(initial);
  const [table, setTable] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (scrollTarget) {
      document
        .getElementById(scrollTarget.id)
        ?.scrollIntoView({ block: "start" });
    }
  }, [scrollTarget]);
  useEffect(() => {
    let active = true;
    const selectQuestion = (hash: string) => {
      const match = /^#q-(\d+)$/.exec(hash);
      if (!match || !active) return;
      const target = items.findIndex(
        (item) => item.position === Number(match[1]),
      );
      if (target < 0) return false;
      setIndex(target);
      setScrollTarget({ id: hash.slice(1) });
      return true;
    };
    const selectHash = () => selectQuestion(window.location.hash);
    const onQuestionLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const url = new URL(link.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        url.search !== window.location.search ||
        !selectQuestion(url.hash)
      )
        return;
      event.preventDefault();
      if (url.hash !== window.location.hash)
        window.history.pushState(null, "", url.hash);
    };
    queueMicrotask(selectHash);
    document.addEventListener("click", onQuestionLink);
    window.addEventListener("hashchange", selectHash);
    return () => {
      active = false;
      window.removeEventListener("hashchange", selectHash);
      document.removeEventListener("click", onQuestionLink);
    };
  }, [items]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.defaultPrevented ||
        (e.target instanceof Element &&
          e.target.closest("[data-comment-navigation]")) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isTyping(e.target)
      )
        return;
      const step = { j: -1, k: 1 }[e.key.toLowerCase()];
      if (!step) return;
      setIndex((i) => Math.min(items.length - 1, Math.max(0, i + step)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);
  const mark = (it: ResultItem) =>
    sprintLayout ? it.mark?.replace(/\s*\/\s*/g, "/") : it.mark;
  const label = (it: ResultItem, i: number) =>
    `Question ${it.position ?? i + 1}${it.mark ? `, ${mark(it)} marks` : ""}${it.pill ? `, ${it.pill}` : ""}${it.flagged ? ", flagged" : ""}`;
  const mcTable = mcGrid && mcGrid.length > 0 && (
    <Card>
      <CardHeader
        className={
          sprintLayout
            ? "flex flex-wrap items-baseline justify-between gap-x-4"
            : undefined
        }
      >
        <CardTitle>
          <h2>Multiple choice answers</h2>
        </CardTitle>
        {sprintLayout && (
          <p className="text-ink-2 text-sm">
            {mcGrid.filter((r) => r.right).length} of {mcGrid.length} correct
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div
          className={
            sprintLayout
              ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-x-6 gap-y-2"
              : "grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4"
          }
        >
          {Array.from({ length: Math.ceil(mcGrid.length / 5) }, (_, group) => (
            <Table
              className={cn(
                "table-hairline [&_td]:px-1 [&_th]:px-1",
                sprintLayout &&
                  // Rows split by hairlines only: no frame or columns inside the card.
                  "border-0 [&_:is(th,td)]:border-x-0 [&_th]:tracking-normal [&_th]:normal-case [&_thead_th]:border-t-0 [&_tr]:border-solid",
              )}
              key={group}
              aria-label={`Multiple choice answers ${group + 1}`}
            >
              <TableHeader>
                <TableRow>
                  {["Q", "Your", "Correct", "Result"].map((h) => (
                    <TableHead key={h} scope="col">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {mcGrid.slice(group * 5, group * 5 + 5).map((r) => (
                  <TableRow
                    key={r.position}
                    className="cursor-pointer"
                    onClick={() => {
                      setIndex(
                        items.findIndex((it) => it.position === r.position),
                      );
                      document
                        .getElementById("results-questions")
                        ?.scrollIntoView({ block: "start" });
                    }}
                  >
                    <TableCell>
                      <button
                        type="button"
                        aria-label={`Review question ${r.position}`}
                        className={
                          sprintLayout
                            ? "text-ink flex min-h-9 items-center font-semibold underline-offset-4 hover:underline focus-visible:ring-2"
                            : "flex min-h-9 min-w-9 items-center justify-center rounded-full border font-semibold focus-visible:ring-2"
                        }
                      >
                        {sprintLayout ? `Q${r.position}` : r.position}
                      </button>
                    </TableCell>
                    <TableCell>{r.your}</TableCell>
                    <TableCell>{r.correct}</TableCell>
                    <TableCell>
                      {!r.answered ? (
                        <StatusPill pill="Not answered" />
                      ) : r.right == null ? (
                        "Pending"
                      ) : (
                        <span
                          className={cn(
                            "flex items-center gap-1 text-xs",
                            r.right ? "text-success" : "text-destructive",
                          )}
                        >
                          {r.right ? (
                            <Check aria-hidden className="size-4" />
                          ) : (
                            <Close aria-hidden className="size-4" />
                          )}
                          {r.right ? "Correct" : "Incorrect"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}
        </div>
      </CardContent>
    </Card>
  );
  if (sprintLayout)
    return (
      <SprintAnswers
        items={items}
        index={index}
        setIndex={setIndex}
        table={table}
        setTable={setTable}
        label={label}
        mark={mark}
        mcTable={mcTable}
        view={views[index]}
        actions={actions?.[index]}
      />
    );
  return (
    <section className="bg-card shadow-card space-y-5 rounded-xl border p-5">
      {table && mcTable}
      <div
        id="results-questions"
        className="relative flex scroll-mt-20 flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h2 className="text-sm font-semibold">Your answers</h2>
          <ul
            aria-label="Answer key"
            className="text-muted-foreground mt-2 flex flex-col gap-x-4 gap-y-1 text-xs sm:flex-row sm:flex-wrap"
          >
            {[
              ["Correct", "bg-success-soft"],
              ["Part marks", "bg-warning-soft"],
              ["Incorrect", "bg-brand-soft"],
              ["Not answered", "border border-dashed"],
            ].map(([label, tone]) => (
              <li key={label} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-3 rounded", tone)} />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="absolute top-0 right-0 flex gap-2 sm:static">
          <button
            type="button"
            onClick={() => setTable(false)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]",
              !table && "bg-card shadow-xs",
            )}
          >
            <PortalIcon name="layout-grid" className="size-3.5" /> Review
          </button>
          <Toggle
            aria-label="Table view"
            variant="default"
            size="sm"
            pressed={table}
            onPressedChange={setTable}
          >
            <PortalIcon name="table-2" className="size-3.5" /> Table
          </Toggle>
        </div>
      </div>
      {table ? (
        <Table aria-label="Questions" className="table-hairline">
          <TableHeader>
            <TableRow>
              {["#", "Type", "Topic", "Source", "Mark", "Status"].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, i) => (
              <TableRow
                key={i}
                aria-selected={i === index}
                className="aria-selected:bg-accent cursor-pointer"
                onClick={() => setIndex(i)}
              >
                <TableCell>
                  <button
                    type="button"
                    aria-label={label(it, i)}
                    className="font-medium"
                  >
                    {it.position ?? i + 1}
                  </button>
                </TableCell>
                <TableCell>{it.type}</TableCell>
                <TableCell>{it.topic}</TableCell>
                <TableCell>{it.source}</TableCell>
                <TableCell className="tabular-nums">
                  {mark(it) ?? "Pending"}
                </TableCell>
                <TableCell>
                  {it.pill && <StatusPill pill={it.pill} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <nav aria-label="Questions" className="flex flex-wrap gap-x-8 gap-y-5">
          {[...new Set(items.map((it) => it.type))].map((type) => (
            <div key={type} className="min-w-0">
              <p className="text-muted-foreground mb-2 text-xs">{type}</p>
              <div className="flex flex-wrap gap-2">
                {items.map(
                  (it, i) =>
                    it.type === type && (
                      <button
                        key={i}
                        type="button"
                        title={it.pill ?? undefined}
                        aria-label={label(it, i)}
                        aria-current={i === index ? "true" : undefined}
                        onClick={() => setIndex(i)}
                        className={cn(
                          "grid size-12 content-center rounded-xl border border-transparent text-sm font-medium tabular-nums",
                          it.tone
                            .replace(
                              /border-(success|warning|destructive)/g,
                              "border-transparent",
                            )
                            .replace(/bg-destructive-soft/g, "bg-brand-soft")
                            .replace(/text-destructive/g, "text-brand-text"),
                          !it.mark && "border-border border-dashed",
                          i === index && "ring-primary ring-2 ring-offset-2",
                        )}
                      >
                        {it.position ?? i + 1}
                        {type !== "Multiple choice" && it.mark && (
                          <span className="mt-0.5 text-[10px] font-normal">
                            {mark(it)}
                          </span>
                        )}
                      </button>
                    ),
                )}
              </div>
            </div>
          ))}
        </nav>
      )}
      <div key={index}>{views[index]}</div>
    </section>
  );
}

/** Sprint results: pills (or the table) to pick a question, its actions and previous / next, then the question. */
function SprintAnswers({
  items,
  index,
  setIndex,
  table,
  setTable,
  label,
  mark,
  mcTable,
  view,
  actions,
}: {
  items: ResultItem[];
  index: number;
  setIndex: (i: number) => void;
  table: boolean;
  setTable: (table: boolean) => void;
  label: (it: ResultItem, i: number) => string;
  mark: (it: ResultItem) => string | null | undefined;
  mcTable: React.ReactNode;
  view: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const shown = (it: ResultItem) =>
    it.state === "not_answered" ? "—" : (mark(it) ?? "—");
  const near = [index - 1, index + 1].map((i) => (items[i] ? i : undefined));
  return (
    <section className="space-y-4">
      <div
        id="results-questions"
        className="flex scroll-mt-20 flex-wrap items-end justify-between gap-3"
      >
        <h2 className="text-xl font-[650] tracking-tight">Your answers</h2>
        <ToggleGroup
          className="results-toggle"
          aria-label="Show questions as"
          size="sm"
          variant="default"
          value={[table ? "table" : "review"]}
          onValueChange={(v) => v[0] && setTable(v[0] === "table")}
        >
          <ToggleGroupItem value="review">Review</ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table view">
            Table
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {table ? (
        <div className="space-y-4">
          {mcTable}
          <div className="bg-card shadow-card overflow-hidden rounded-xl border">
            <Table
              aria-label="Questions"
              className="table-hairline border-0 [&_tbody_tr:last-child>td]:border-b-0 [&_tr:first-child>*]:border-t-0 [&_tr>*:first-child]:border-l-0 [&_tr>*:last-child]:border-r-0"
            >
              <TableHeader>
                <TableRow>
                  {["Question", "Topic", "Source", "Mark", "Result"].map(
                    (h) => (
                      <TableHead
                        key={h}
                        scope="col"
                        className="text-foreground"
                      >
                        {h}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, i) => {
                  const state = it.state ?? "pending";
                  return (
                    <TableRow
                      key={i}
                      data-open={i === index || undefined}
                      className="data-open:[&_td]:bg-brand-soft cursor-pointer"
                      onClick={() => setIndex(i)}
                    >
                      <TableCell className="w-px whitespace-nowrap">
                        <button
                          type="button"
                          aria-label={label(it, i)}
                          aria-current={i === index ? "true" : undefined}
                          className="font-semibold underline underline-offset-3"
                        >
                          Q{it.position ?? i + 1}
                        </button>
                      </TableCell>
                      <TableCell>{it.topic}</TableCell>
                      <TableCell>{it.source}</TableCell>
                      <TableCell className="w-px font-semibold whitespace-nowrap">
                        {shown(it)}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden
                            className={cn(
                              "inline-grid h-4 w-5 place-items-center rounded-full",
                              RESULT_SWATCH[state],
                            )}
                          >
                            <PortalIcon
                              name={RESULT_ICON[state]}
                              className="size-3"
                            />
                          </span>
                          {/* A terminal status pill ("Couldn't mark") already says it. */}
                          {!(state === "unmarked" && it.pill) &&
                            RESULT_WORD[state]}
                          {it.pill &&
                            it.pill !== "Marked" &&
                            it.pill !== "Not answered" && (
                              <StatusPill pill={it.pill} />
                            )}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <ol aria-label="Questions" className="flex flex-wrap gap-2">
            {items.map((it, i) => {
              const state = it.state ?? "pending";
              return (
                <li key={i}>
                  <button
                    type="button"
                    title={it.pill ?? undefined}
                    aria-label={label(it, i)}
                    aria-current={i === index ? "true" : undefined}
                    data-state={state}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "focus-visible:ring-ring relative inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-transparent px-3 text-sm font-semibold tabular-nums transition-colors outline-none hover:border-current/35 focus-visible:ring-2 focus-visible:ring-offset-2",
                      RESULT_TILE[state],
                      i === index && RESULT_OPEN,
                    )}
                  >
                    <span>Q{it.position ?? i + 1}</span>
                    <PortalIcon
                      name={RESULT_ICON[state]}
                      aria-hidden
                      className="size-3.5"
                    />
                    {state !== "not_answered" && <span>{shown(it)}</span>}
                    {it.flagged && (
                      <span
                        aria-hidden
                        data-flag
                        className={cn(
                          "ring-background absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2",
                          TRACKER_STATE.flag,
                        )}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          <ul
            aria-label="Key"
            className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-[13px]"
          >
            {RESULT_LEGEND.map(([text, state]) => (
              <li key={text} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "inline-grid h-4 w-5 place-items-center rounded-full",
                    state === "open"
                      ? "border-ink-2 border-[1.5px]"
                      : RESULT_SWATCH[state],
                  )}
                >
                  {state !== "open" && (
                    <PortalIcon name={RESULT_ICON[state]} className="size-3" />
                  )}
                </span>
                {text}
              </li>
            ))}
            {items.some((it) => it.flagged) && (
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn("size-2.5 rounded-full", TRACKER_STATE.flag)}
                />
                Flagged
              </li>
            )}
          </ul>
        </div>
      )}
      {/* Keyed by question: a draft in one question's actions (e.g. a dispute) never carries over. */}
      <Fragment key={`actions-${index}`}>{actions}</Fragment>
      <nav
        aria-label="Previous and next question"
        className="grid grid-cols-2 gap-3"
      >
        {/* Both buttons stay mounted (aria-disabled, not disabled) so keyboard focus survives reaching Q1 or the last question. */}
        {near.map((i, side) => (
          <button
            key={side}
            type="button"
            aria-disabled={i === undefined || undefined}
            onClick={() => {
              if (i === undefined) return;
              setIndex(i);
              document
                .getElementById("results-questions")
                ?.scrollIntoView({ block: "start" });
            }}
            className={cn(
              "bg-card shadow-card hover:bg-muted/50 focus-visible:ring-ring aria-disabled:hover:bg-card flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 transition-colors outline-none focus-visible:ring-2 aria-disabled:cursor-default aria-disabled:opacity-50",
              side ? "justify-end text-right" : "text-left",
            )}
          >
            {!side && (
              <PortalIcon
                name="chevron-left"
                aria-hidden
                className="size-4 shrink-0"
              />
            )}
            <span className="min-w-0">
              <span className="text-muted-foreground block text-xs">
                {side ? "Next question" : "Previous question"}
              </span>
              {i === undefined ? (
                <span className="block truncate text-sm font-semibold">
                  {side ? "Last question" : "First question"}
                </span>
              ) : (
                <>
                  <span className="block truncate text-sm font-semibold">
                    Q{items[i].position ?? i + 1} · {items[i].topic}
                  </span>
                  <span className="text-muted-foreground block text-xs tabular-nums">
                    {shown(items[i])}
                  </span>
                </>
              )}
            </span>
            {!!side && (
              <PortalIcon
                name="chevron-right"
                aria-hidden
                className="size-4 shrink-0"
              />
            )}
          </button>
        ))}
      </nav>
      <div key={index}>{view}</div>
    </section>
  );
}
