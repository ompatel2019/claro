"use client";
import { formatSampleMaths } from "@/lib/sample-maths";
import Link from "next/link";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert } from "@/components/icons";
import {
  answerTextOf,
  bandOf,
  layoutCards,
  markLabel,
  markingState,
  nextMarkLine,
  readComments,
  type FeedbackComment,
  type NumberedComment,
  type ReviewRow,
} from "@/lib/feedback";
import { criteriaCoverMarks } from "@/lib/marking/own-criteria";
import { highlightSegments } from "@/lib/practice";
import { ScoreRing } from "./claro/data-display";
import { cn } from "@/lib/utils";
import { RetryAnswer } from "./retry-answer";
import { StatusPill, statePill } from "./status-pill";
import { Badge } from "./ui/badge";
import { Button, buttonVariants } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Card, CardContent } from "./ui/card";
import { Popover, PopoverContent } from "./ui/popover";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

import { MarkedAnswerDoc } from "./annotated-feedback/marked-answer-doc";
import {
  FeedbackDetails,
  CommentFields,
  CommentCard,
  Uncertain,
  Photos,
  ResultAnswerCard,
  type FeedbackEdit,
} from "./annotated-feedback/parts";
export {
  FeedbackDetails,
  type EditableComment,
  type FeedbackEdit,
} from "./annotated-feedback/parts";

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const WIDE = 760;

/** Display only: keep UTF-16 offsets, including both characters of a lone CRLF. */
export function displayAnswer(text: string) {
  return text.replace(/(?:\r\n|\r|\n)+/g, (breaks) =>
    /^(?:\r\n|\r|\n)$/.test(breaks) ? " ".repeat(breaks.length) : breaks,
  );
}

/** Question criteria, score, annotated answer with margin comments, and sample. */
export function AnnotatedFeedback({
  row,
  photos = [],
  actions,
  readOnly = false,
  edit,
  showReferences = true,
  singleResult = false,
  keepLineBreaks = false,
  answerOnly = false,
  aiNote = true,
  flush = false,
}: {
  row: ReviewRow;
  photos?: string[];
  actions?: React.ReactNode;
  readOnly?: boolean;
  edit?: FeedbackEdit;
  showReferences?: boolean;
  /** Standalone student result cards; defaults preserve embedded/admin rendering. */
  singleResult?: boolean;
  /** Typed answers: keep every line break instead of joining single ones. */
  keepLineBreaks?: boolean;
  /** Render only the marked answer (heading, filter, highlights, comments); the host page owns score, criteria, next steps and references. */
  answerOnly?: boolean;
  /** The AI line under the marked answer; results pages show it once instead. */
  aiNote?: boolean;
  /** Draw the marked answer inside the host's card, with no frame of its own. */
  flush?: boolean;
}) {
  const nextCommentId = useRef(
    Math.min(0, ...(edit?.comments.map((c) => c.id) ?? [])) - 1,
  );
  const state = markingState(row);
  const text = answerTextOf(row);
  const displayedText = keepLineBreaks ? text : displayAnswer(text);
  const comments = useMemo(
    () =>
      edit
        ? [...edit.comments]
            .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
            .map((c, i) => ({ ...c, n: i + 1 }))
        : readComments(row.feedback, text),
    [row.feedback, text, edit],
  );
  const [selection, setSelection] = useState<{
    quote: string;
    start: number;
    rect: DOMRect;
  } | null>(null);
  const [draft, setDraft] = useState<FeedbackComment>({
    quote: "",
    start: null,
    kind: "fix",
    tag: "Knowledge",
    body: "",
    next_mark: null,
  });
  useEffect(() => {
    if (!edit) return;
    const clear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelection(null);
        window.getSelection()?.removeAllRanges();
      }
    };
    window.addEventListener("keydown", clear, true);
    return () => window.removeEventListener("keydown", clear, true);
  }, [edit]);
  const [filter, setFilter] = useState<"all" | "strength" | "fix">("all");
  const [hover, setHover] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [popover, setPopover] = useState<{ id: number; el: Element } | null>(
    null,
  );
  const [view, setView] = useState<"typed" | "photo">("typed");
  const [wide, setWide] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const doc = useRef<HTMLDivElement>(null);
  const margin = useRef<HTMLDivElement>(null);

  const max = row.max_marks ?? row.marks;
  const lowConfidence = row.feedback?.confidence === "low";
  const showMark =
    !lowConfidence &&
    row.mark != null &&
    ["marked", "in_review", "reviewed"].includes(state);
  const completeCriteria = criteriaCoverMarks(row.criteria, max);
  const band = completeCriteria ? bandOf(row.criteria, row.band) : null;
  const next =
    edit?.nextMark ??
    nextMarkLine(comments, row.feedback, Number(row.mark) >= max);
  const visible = comments.filter((c) => filter === "all" || c.kind === filter);
  const anchored = comments.filter((c) => c.start !== null);
  const pill = statePill(state, row.review);
  // Marked, read-only typed answers use the Docs-style view; editing and the photo keep the margin layout.
  const docView =
    !edit && showMark && !!text && (view === "typed" || !photos.length);
  const AnswerContainer =
    singleResult && !docView ? ResultAnswerCard : Fragment;
  const outline = Array.isArray(row.feedback?.better_answer_outline)
    ? (row.feedback.better_answer_outline as string[])
    : [];

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWide(entry.contentRect.width >= WIDE),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [singleResult]);

  // Google Docs layout: each card level with its highlight, pushed down on collision.
  useLayoutEffect(() => {
    const d = doc.current;
    const m = margin.current;
    if (!wide || filter !== "all" || !d || !m) return;
    function place() {
      const area = m!.querySelector<HTMLElement>("[data-anchor-area]")!;
      const top = area.getBoundingClientRect().top;
      const cards = [...m!.querySelectorAll<HTMLElement>("[data-anchored]")];
      const tops = layoutCards(
        cards.map((card) => ({
          anchor:
            (d!
              .querySelector(`[data-anchors~="${card.dataset.card}"]`)
              ?.getBoundingClientRect().top ?? top) - top,
          height: card.offsetHeight,
        })),
      );
      cards.forEach((card, i) => (card.style.top = `${tops[i]}px`));
      const last = cards.at(-1);
      area.style.height = last
        ? `${tops.at(-1)! + last.offsetHeight}px`
        : "0px";
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(d);
    return () => observer.disconnect();
  }, [wide, filter, view, comments]);

  const card = (id: number) =>
    root.current?.querySelector<HTMLElement>(`[data-card="${id}"]`);
  const highlight = (id: number) =>
    doc.current?.querySelector<HTMLElement>(`[data-anchors~="${id}"]`);

  function openComment(c: NumberedComment, from?: Element) {
    setHover(c.id);
    if (!wide && from) return setPopover({ id: c.id, el: from });
    const el = card(c.id);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({
      block: "nearest",
      behavior: reduced() ? "auto" : "smooth",
    });
  }
  function jumpTo(id: number) {
    setHover(id);
    const el = highlight(id);
    if (!el) return;
    el.scrollIntoView({
      block: "center",
      behavior: reduced() ? "auto" : "smooth",
    });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1500);
  }
  function onKey(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    if (edit && ["ArrowDown", "ArrowUp"].includes(e.key)) return;
    const order = visible;
    const at = order.findIndex((c) => c.id === hover);
    if (["j", "J", "ArrowDown", "k", "K", "ArrowUp"].includes(e.key)) {
      if (!order.length) return;
      e.preventDefault();
      const step = ["k", "K", "ArrowUp"].includes(e.key) ? -1 : 1;
      const c =
        order[at < 0 ? (step > 0 ? 0 : order.length - 1) : at + step] ??
        order[at];
      setHover(c.id);
      (highlight(c.id) ?? card(c.id))?.focus();
    } else if (e.key === "Escape") {
      setHover(null);
      setPopover(null);
    }
  }

  function captureSelection() {
    if (!edit || edit.disabled) return;
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed || !doc.current) return;
    const range = selected.getRangeAt(0);
    if (
      !doc.current.contains(range.startContainer) ||
      !doc.current.contains(range.endContainer)
    )
      return;
    const plain = (range: Range) => {
      const content = range.cloneContents();
      content.querySelectorAll("sup").forEach((el) => el.remove());
      return content.textContent ?? "";
    };
    const before = range.cloneRange();
    before.selectNodeContents(doc.current);
    before.setEnd(range.startContainer, range.startOffset);
    const start = plain(before).length;
    const selectedText = plain(range);
    if (
      !selectedText.trim() ||
      displayedText.slice(start, start + selectedText.length) !== selectedText
    )
      return;
    const quote = text.slice(start, start + selectedText.length);
    setPopover(null);
    setDraft({
      quote,
      start,
      kind: "fix",
      tag: "Knowledge",
      body: "",
      next_mark: null,
    });
    setSelection({
      quote,
      start,
      rect: range.getBoundingClientRect(),
    });
  }
  useEffect(() => {
    if (!edit || edit.disabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(captureSelection, 250);
    };
    document.addEventListener("selectionchange", changed);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", changed);
    };
  });

  const label = (c: NumberedComment) =>
    `${c.kind === "strength" ? "Strength" : "Fix"} ${c.n}${c.tag ? `, ${c.tag}` : ""}: ${c.body}`;
  const shown = (c: NumberedComment) => visible.includes(c);
  const answer = (
    <div
      ref={doc}
      onPointerUp={edit && !edit.disabled ? captureSelection : undefined}
      onKeyUp={edit && !edit.disabled ? captureSelection : undefined}
      className={
        singleResult
          ? "booklet relative min-h-28 font-serif text-xl leading-[32px] whitespace-pre-wrap"
          : "relative max-w-[70ch] font-serif text-xl leading-8 whitespace-pre-wrap"
      }
    >
      {highlightSegments(displayedText, anchored).map((seg) => {
        const covering = seg.comments
          .map((i) => anchored[i])
          .filter((c) => showMark && shown(c));
        if (!covering.length)
          return <Uncertain key={seg.start} text={seg.text} />;
        // Where highlights overlap, the later comment wins.
        const owner = covering.reduce((a, b) => (b.n > a.n ? b : a));
        const starts = covering.filter((c) => c.start === seg.start);
        const ends = covering.filter(
          (c) => c.start! + c.quote.length === seg.start + seg.text.length,
        );
        const focusable = starts[0];
        return (
          <span key={seg.start}>
            <mark
              data-anchors={starts.map((c) => c.id).join(" ") || undefined}
              role={focusable ? "button" : undefined}
              tabIndex={focusable ? 0 : undefined}
              aria-label={focusable ? label(focusable) : undefined}
              onClick={(e) => {
                if (edit && !window.getSelection()?.isCollapsed) return;
                openComment(owner, e.currentTarget);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openComment(focusable ?? owner, e.currentTarget);
                }
              }}
              onMouseEnter={() => setHover(owner.id)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                "mk text-ink cursor-pointer bg-transparent outline-offset-1",
                owner.kind === "strength"
                  ? "decoration-success underline decoration-wavy decoration-2 underline-offset-4"
                  : "decoration-destructive underline decoration-wavy decoration-2 underline-offset-4",
                covering.some((c) => c.id === hover) &&
                  "outline-ink/40 outline-2",
                covering.some((c) => c.id === flash) && "outline-ink outline-2",
              )}
            >
              <Uncertain text={seg.text} />
            </mark>
            {ends.map((c) => (
              <sup
                key={c.id}
                aria-hidden
                className={cn(
                  "mx-0.5 font-sans text-xs font-semibold",
                  c.kind === "strength" ? "text-success" : "text-destructive",
                )}
              >
                {c.n}
              </sup>
            ))}
          </span>
        );
      })}
    </div>
  );

  const cardProps = (c: NumberedComment) => ({
    c,
    active: hover === c.id || flash === c.id,
    onMouseEnter: () => setHover(c.id),
    onMouseLeave: () => setHover(null),
    onClick: () => jumpTo(c.id),
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && jumpTo(c.id),
    className: "cursor-pointer",
  });
  const filterBar = showMark && comments.length > 0 && (
    <ToggleGroup
      aria-label="Filter comments"
      size="sm"
      variant="outline"
      value={[filter]}
      onValueChange={(v) => v[0] && setFilter(v[0] as typeof filter)}
    >
      <ToggleGroupItem value="all">All ({comments.length})</ToggleGroupItem>
      <ToggleGroupItem value="strength">
        Strengths ({comments.filter((c) => c.kind === "strength").length})
      </ToggleGroupItem>
      <ToggleGroupItem value="fix">
        Fixes ({comments.filter((c) => c.kind === "fix").length})
      </ToggleGroupItem>
    </ToggleGroup>
  );
  const overall = visible.filter((c) => c.start === null);
  const marginCards = showMark && comments.length > 0 && (
    <div>
      {wide && filter === "all" ? (
        <div ref={margin}>
          <div data-anchor-area className="relative">
            {visible
              .filter((c) => c.start !== null)
              .map((c) => (
                <CommentCard
                  key={c.id}
                  data-anchored=""
                  edit={edit}
                  {...cardProps(c)}
                  className="absolute inset-x-0 cursor-pointer"
                />
              ))}
          </div>
          {overall.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-muted-foreground text-xs font-semibold tracking-[0.04em] uppercase">
                Overall
              </h4>
              {overall.map((c) => (
                <CommentCard key={c.id} edit={edit} {...cardProps(c)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <ol className="space-y-2">
          {visible.map((c, i) => (
            <li key={c.id}>
              {c.start === null && overall[0] === c && (
                <h4
                  className={cn(
                    "text-muted-foreground mb-2 text-xs font-semibold tracking-[0.04em] uppercase",
                    i > 0 && "mt-4",
                  )}
                >
                  Overall
                </h4>
              )}
              <CommentCard edit={edit} {...cardProps(c)} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
  const popComment = comments.find((c) => c.id === popover?.id);

  return (
    <div
      ref={root}
      data-comment-navigation
      className={cn("space-y-4", singleResult && "min-w-0")}
      onKeyDown={docView ? undefined : onKey}
    >
      {!answerOnly && showReferences && !!row.criteria?.length && (
        <section
          aria-label="Marking criteria"
          className={cn("space-y-3", !flush && "rounded-xl border p-4")}
        >
          <h2 className="text-sm font-semibold">Marking criteria</h2>
          {completeCriteria ? (
            <Table className="[&_th]:tracking-normal [&_th]:normal-case">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Marks</TableHead>
                  <TableHead scope="col">Descriptor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.criteria.map((c) => (
                  <TableRow
                    key={c.descriptor}
                    className={cn(
                      "h-auto",
                      showMark && c === band?.row && "bg-accent",
                    )}
                  >
                    <TableCell className="w-16 align-top">
                      {c.min === c.max ? c.min : `${c.min}–${c.max}`}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {c.descriptor}
                      {showMark && c === band?.row && (
                        <Badge variant="outline" className="ml-2">
                          Your band
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p>
              The marking guidelines are incomplete, so the band table is
              unavailable.
            </p>
          )}
        </section>
      )}

      {answerOnly || docView ? null : singleResult && showMark ? (
        <div className="grid gap-5">
          <Card className="min-w-0 p-5">
            <div className="flex items-center gap-5">
              <ScoreRing score={Number(row.mark)} of={max} size={96} />
              <div className="space-y-2">
                {pill && <StatusPill pill={pill} />}
                <p className="text-sm font-semibold">
                  {max - Number(row.mark) > 0
                    ? `${max - Number(row.mark)} ${max - Number(row.mark) === 1 ? "mark" : "marks"} from full marks`
                    : "Full marks"}
                </p>
                {state === "in_review" && (
                  <p className="text-muted-foreground text-[13px]">
                    Our team is double-checking this mark.
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {showMark ? (
                <p
                  role="img"
                  aria-label={`Your mark: ${markLabel(row).replaceAll(" ", "")}`}
                  className="text-4xl leading-tight font-bold tabular-nums"
                >
                  {markLabel(row).split(" / ")[0]}
                  <span className="text-muted-foreground text-lg font-medium">
                    /{max}
                  </span>
                </p>
              ) : (
                state === "marking" && (
                  <div
                    aria-hidden
                    className="bg-muted h-9 w-24 animate-pulse rounded-lg"
                  />
                )
              )}
              {showMark && band && (
                <Tooltip>
                  <TooltipTrigger render={<span tabIndex={0} />}>
                    <Badge variant="secondary">{band.label}</Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {band.row.descriptor}
                  </TooltipContent>
                </Tooltip>
              )}
              {pill && <StatusPill pill={pill} />}
            </div>
            {lowConfidence && (
              <p>
                {String(row.feedback?.note ?? "We can't mark this reliably.")}
              </p>
            )}
            {!edit &&
              state === "in_review" &&
              row.review?.reason !== "student_dispute" && (
                <p>Our team is double-checking this mark.</p>
              )}
            {state === "failed" && (
              <div
                role="alert"
                className="bg-destructive-soft space-y-2 rounded-xl p-3"
              >
                <p className="text-destructive flex items-center gap-2 font-semibold">
                  <Alert aria-hidden className="size-4" />
                  We couldn’t mark this one.
                </p>
                {!readOnly && <RetryAnswer ids={[row.attempt_id]} />}
              </div>
            )}
            {state === "unreadable" && (
              <p role="alert" className="font-semibold">
                We couldn’t read this photo.
              </p>
            )}
            {state === "not_answered" && (
              <p>No answer was given, so there was nothing to mark.</p>
            )}
            {state === "marking" && (
              <div aria-hidden className="space-y-2">
                <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
                <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <AnswerContainer>
        {!docView && (text || photos.length > 0) && (
          <div>
            <h2 className="text-sm font-semibold">
              {showMark ? "Your answer, marked" : "Your answer"}
            </h2>
            {comments.length > 0 && (
              <p className="text-muted-foreground mt-1 text-[13px]">
                Hover or focus a note to see the words it refers to.
              </p>
            )}
          </div>
        )}
        {((filterBar && !docView) || (photos.length > 0 && text)) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {view === "typed" && !docView && filterBar}
            {photos.length > 0 && text && (
              <ToggleGroup
                aria-label="Answer view"
                variant="outline"
                size="sm"
                value={[view]}
                onValueChange={(v) => v[0] && setView(v[0] as typeof view)}
              >
                <ToggleGroupItem value="typed">Typed copy</ToggleGroupItem>
                <ToggleGroupItem value="photo">Photo</ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
        )}
        {(view === "photo" || !text) && photos.length > 0 ? (
          <Photos photos={photos} />
        ) : docView ? (
          <MarkedAnswerDoc
            // A new answer (e.g. the next checked question) starts fresh:
            // slider back on its next-mark comment, highlights re-synced.
            key={`${row.attempt_id}:${text}`}
            text={
              keepLineBreaks || !row.transcript ? text : displayAnswer(text)
            }
            comments={comments}
            flush={flush}
            aiNote={aiNote}
            note={
              photos.length > 0
                ? "Highlights show on the typed copy of your photo."
                : undefined
            }
            score={
              answerOnly
                ? undefined
                : {
                    label: `Your mark: ${markLabel(row).replaceAll(" ", "")}`,
                    mark: markLabel(row).split(" / ")[0],
                    max,
                    gain: Math.max(0, max - Number(row.mark)),
                    tags: [band?.label, pill].filter((t): t is string => !!t),
                    note:
                      state === "in_review" &&
                      row.review?.reason !== "student_dispute"
                        ? "Our team is double-checking this mark."
                        : null,
                    earned: strings(row.feedback?.earned),
                    missing: strings(row.feedback?.missing_points),
                    next,
                  }
            }
          />
        ) : text ? (
          <div
            className={cn(
              "grid gap-6",
              wide &&
                (singleResult
                  ? "grid-cols-[minmax(0,1fr)_300px]"
                  : "grid-cols-[minmax(0,1fr)_320px]"),
            )}
          >
            <div className="space-y-2">
              {photos.length > 0 && (
                <p className="text-muted-foreground text-[13px]">
                  Highlights show on the typed copy of your photo.
                </p>
              )}
              {answer}
            </div>
            {marginCards}
          </div>
        ) : null}
        {edit && (
          <>
            <p className="text-muted-foreground text-xs">
              Select answer text to add a comment · Esc clears selection.
            </p>
            <Popover
              open={!!selection}
              onOpenChange={(open) => !open && setSelection(null)}
            >
              <PopoverContent
                anchor={
                  selection
                    ? { getBoundingClientRect: () => selection.rect }
                    : undefined
                }
                className="max-h-[75vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
                initialFocus={false}
              >
                <h3 className="font-semibold">Add comment</h3>
                <p className="max-h-20 overflow-auto text-xs">
                  “{selection?.quote}”
                </p>
                <fieldset disabled={edit.disabled}>
                  <CommentFields value={draft} onChange={setDraft} />
                </fieldset>
                <Button
                  type="button"
                  disabled={edit.disabled || !draft.body.trim() || !draft.tag}
                  onClick={() => {
                    edit.onChange(
                      [
                        ...edit.comments,
                        {
                          ...draft,
                          id: nextCommentId.current--,
                        },
                      ],
                      edit.nextMark,
                    );
                    setSelection(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                >
                  Add comment
                </Button>
              </PopoverContent>
            </Popover>
          </>
        )}
        <Popover
          open={!!popComment}
          onOpenChange={(open) => !open && setPopover(null)}
        >
          <PopoverContent anchor={popover?.el} className="w-80 p-0">
            {popComment &&
              (edit ? (
                <CommentCard edit={edit} c={popComment} className="border-0" />
              ) : (
                <CommentCard c={popComment} className="border-0" />
              ))}
          </PopoverContent>
        </Popover>

        {!answerOnly && !docView && showMark && (edit || next) && (
          <div>
            <h3 className="text-sm font-semibold">
              {singleResult ? "Your next mark" : "What gets you the next mark"}
            </h3>
            {edit ? (
              <Textarea
                aria-label="What gets you the next mark"
                className="mt-1"
                value={edit.nextMark}
                disabled={edit.disabled}
                maxLength={4000}
                onChange={(e) => edit.onChange(edit.comments, e.target.value)}
              />
            ) : (
              <p className="mt-1">{next}</p>
            )}
          </div>
        )}

        {!answerOnly && showMark && (
          <div className="space-y-2">
            {Number(row.mark) < max && outline.length > 0 && (
              <FeedbackDetails
                name="outline"
                title="How to reach full marks"
                flat={flush}
              >
                <ul className="list-disc space-y-1 pl-5">
                  {outline.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </FeedbackDetails>
            )}
            {showReferences && row.sample_answer && (
              <section
                aria-label="Sample answer"
                className={cn(
                  "space-y-3",
                  flush ? "border-t pt-5" : "bg-muted/40 rounded-xl border p-5",
                )}
              >
                <h2 className="text-lg font-semibold">Sample answer</h2>
                <p className="max-w-prose text-base leading-relaxed whitespace-pre-wrap">
                  {formatSampleMaths(row.sample_answer)}
                </p>
                <p className="text-muted-foreground text-[13px]">
                  One strong answer. Other answers can earn the same marks.
                </p>
              </section>
            )}
          </div>
        )}
      </AnswerContainer>
      {!answerOnly && (
        <div className="flex flex-wrap gap-2">
          {!edit && !singleResult && row.topic_id && (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`/student/sprint?type=${row.type}&sub=${encodeURIComponent(row.topic_id)}`}
            >
              Practise similar
            </Link>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && !!v.trim())
    : [];
