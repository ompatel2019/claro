"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Close, PortalIcon } from "@/components/icons";
import type { NumberedComment } from "@/lib/feedback";
import { highlightSegments } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { AI_NOTE } from "./ai-note";
import { useCommentSlider, useHighlightSync } from "./comment-slider";
import { Uncertain } from "./parts";

export type MarkedScore = {
  /** e.g. "Your mark: 3/5" */
  label: string;
  mark: string;
  max: number;
  gain: number;
  tags: string[];
  note?: string | null;
  earned: string[];
  missing: string[];
  next: string | null;
};

type Intent = { reveal?: boolean; showMark?: boolean; focus?: boolean };
type Piece = { text: string; start: number; comments: number[] };

const LINE_BREAKS = /((?:\r\n|\r|\n)+)/;
const calm = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Splits the answer at line breaks and highlight boundaries, keeping UTF-16 offsets. */
export function answerParagraphs(
  text: string,
  anchored: Pick<NumberedComment, "start" | "quote">[],
) {
  const paragraphs: Piece[][] = [[]];
  for (const seg of highlightSegments(text, anchored)) {
    let offset = seg.start;
    seg.text.split(LINE_BREAKS).forEach((part, i) => {
      if (i % 2) paragraphs.push([]);
      else if (part)
        paragraphs.at(-1)!.push({
          text: part,
          start: offset,
          comments: seg.comments,
        });
      offset += part.length;
    });
  }
  return paragraphs.filter((p) => p.length);
}

/** Innermost first: the later start, then the shorter quote. */
const innermost = (a: NumberedComment, b: NumberedComment) =>
  b.start! - a.start! || a.quote.length - b.quote.length;

/**
 * Comment column focus: the focused comment is pressed, the rest dim. Nothing focused, nothing dims.
 */
export function commentFocus(ids: number[], focused: number | null) {
  return ids.map((id) => ({
    id,
    pressed: id === focused,
    dim: focused !== null && id !== focused,
  }));
}

/**
 * Column shift (px, for translateY) that lines the focused comment's top up with its phrase.
 * `cardTop` is measured with the current shift applied; `floor` stops the focused comment rising
 * above the top of the column (comments before it slide out of the clipped column instead).
 */
export function columnShift(
  phraseTop: number,
  cardTop: number,
  shift: number,
  floor: number,
) {
  return Math.max(floor, Math.round(shift + phraseTop - cardTop));
}

type Box = { left: number; right: number; top: number; bottom: number };
export type Connector = { id: number; d: string; tail: string | null };

/**
 * A Google Docs style connector, in the body's coordinates: from the page edge level with the
 * phrase to the comment's left edge. The focused pair also gets a tail under the phrase's line.
 */
export function connectorPath(
  id: number,
  phrase: Box,
  card: Box,
  origin: { left: number; top: number },
  edge: number,
  focused: boolean,
): Connector {
  const y1 = Math.round(phrase.bottom + 2 - origin.top);
  const y2 = Math.round(Math.min(card.top + 20, card.bottom) - origin.top);
  const xe = Math.round(edge - origin.left);
  const x2 = Math.round(card.left - origin.left);
  const xm = Math.round((xe + x2) / 2);
  return {
    id,
    d: y1 === y2 ? `M${xe} ${y1}H${x2}` : `M${xe} ${y1}H${xm}V${y2}H${x2}`,
    tail: focused
      ? `M${Math.round(phrase.right - origin.left)} ${y1}H${xe}`
      : null,
  };
}

const label = (c: NumberedComment) =>
  `${c.kind === "strength" ? "Strength" : "Fix"} ${c.n}${c.tag ? `, ${c.tag}` : ""}: ${c.body}`;

/**
 * The read-only marked answer: continuous text with flat highlights, a score card and either a
 * comment slider or (sprint results) every comment in a column.
 */
export function MarkedAnswerDoc({
  text,
  comments,
  score,
  note,
  flush = false,
  aiNote = true,
  column = false,
}: {
  /** Display text: line breaks become paragraphs. */
  text: string;
  comments: NumberedComment[];
  /** The score card; omit when the host page already shows the mark. */
  score?: MarkedScore;
  note?: string;
  /** Sit inside the host's card: no sheet or page box of its own. */
  flush?: boolean;
  /** Show the AI line; off when the host page shows it once for many answers. */
  aiNote?: boolean;
  /** Every comment in a column beside the answer (under it when narrow); no slider. */
  column?: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const doc = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const link = useRef<SVGSVGElement>(null);
  const intent = useRef<Intent | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState("");

  const anchored = comments.filter((c) => c.start !== null);
  const nextComment =
    comments.find((c) => c.kind === "fix" && c.next_mark) ??
    comments.find((c) => c.kind === "fix");
  const linked =
    score?.next && nextComment?.next_mark === score.next ? nextComment : null;
  const slides = useCommentSlider(comments, {
    initialId: (nextComment ?? comments[0])?.id,
  });
  const selected = slides.selected;
  const selectedId = selected?.id ?? null;
  // Column mode: nothing is focused until a highlight or a comment is chosen.
  const [focused, setFocused] = useState<number | null>(null);
  const [shift, setShift] = useState(0);
  const [lines, setLines] = useState<Connector[]>([]);
  const cols = useRef<HTMLOListElement>(null);
  const activeId = column ? focused : selectedId;

  const isWide = () =>
    !!body.current &&
    getComputedStyle(body.current).getPropertyValue("--cma-wide").trim() ===
      "1";
  const highlights = (id: number) => [
    ...(doc.current?.querySelectorAll<HTMLElement>(`[data-anchors~="${id}"]`) ??
      []),
  ];
  function into(el: Element | undefined | null) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    el.scrollIntoView({
      block: "nearest",
      behavior: calm() ? "auto" : "smooth",
    });
  }
  function apply(o: Intent, id: number) {
    const wide = isWide();
    if (o.focus)
      body.current
        ?.querySelector<HTMLElement>(`[data-card="${id}"]`)
        ?.focus({ preventScroll: true });
    if (o.reveal) into(slider.current);
    if (o.showMark && wide) into(highlights(id)[0]);
  }
  /** Move the slider, then scroll or focus once the new comment is on show. */
  function go(id: number, o: Intent) {
    if (id === selectedId) return apply(o, id);
    intent.current = o;
    slides.select(id);
  }

  /** Column mode: focus a comment (from its highlight) or toggle it (from the comment itself). */
  function focusComment(
    id: number,
    from: "text" | "card" | "mark",
    move = false,
  ) {
    // From the text: the page stays put and the column slides so the comment sits level with
    // its phrase. From the comment: nothing moves; its phrase lights up.
    if (from === "text") {
      const phrase = highlights(id)[0]?.getBoundingClientRect();
      const el = body.current?.querySelector<HTMLElement>(
        `[data-card="${id}"]`,
      );
      const card = el?.getBoundingClientRect();
      const floor = -(el?.parentElement?.offsetTop ?? 0);
      setShift((now) =>
        isWide() && phrase && card
          ? columnShift(phrase.top, card.top, now, floor)
          : 0,
      );
    }
    if (move)
      body.current
        ?.querySelector<HTMLElement>(`[data-card="${id}"]`)
        ?.focus({ preventScroll: true });
    const next = from === "card" && focused === id ? null : id;
    // Nothing focused: the column settles back to its start.
    if (next === null) setShift(0);
    setFocused(next);
  }

  /** Keyboard focus on a comment slid out of the clipped column brings it back into view. */
  function revealCard(el: HTMLElement) {
    const view = el.closest(".cma-cols")?.getBoundingClientRect();
    const card = el.getBoundingClientRect();
    if (!view || card.top >= view.top) return;
    const floor = -(el.parentElement?.offsetTop ?? 0);
    setShift((now) => columnShift(view.top, card.top, now, floor));
  }

  useHighlightSync(
    doc,
    activeId,
    (id) => (column ? focusComment(id, "text") : go(id, { reveal: true })),
    { scroll: false },
  );

  const inFocus = column ? comments.find((c) => c.id === focused) : undefined;

  useEffect(() => {
    const o = intent.current;
    intent.current = null;
    if (!o || !selected) return;
    setLive(
      `Comment ${slides.index + 1} of ${slides.count}. ${label(selected)}`,
    );
    apply(o, selected.id);
    // Runs only when the comment on show changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Column connectors: drawn from measured boxes, redrawn on resize, focus and shift.
  useLayoutEffect(() => {
    const b = body.current;
    if (!column || !b) return;
    let frame = 0;
    function layout() {
      const wide = isWide();
      if (!wide) setShift(0);
      const o = b!.getBoundingClientRect();
      const edge = page.current?.getBoundingClientRect().right ?? o.left;
      const next = wide
        ? anchored.flatMap((c) => {
            const rects = highlights(c.id).flatMap((el) => [
              ...el.getClientRects(),
            ]);
            const card = b!
              .querySelector(`[data-card="${c.id}"]`)
              ?.getBoundingClientRect();
            const view = b!.querySelector(".cma-cols")?.getBoundingClientRect();
            // Comments slid (even partly) out of the clipped column get no line.
            if (!rects.length || !card || (view && card.top < view.top))
              return [];
            const last = rects.reduce((a, r) => (r.bottom > a.bottom ? r : a));
            return [connectorPath(c.id, last, card, o, edge, c.id === focused)];
          })
        : [];
      setLines((now) =>
        JSON.stringify(now) === JSON.stringify(next) ? now : next,
      );
    }
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(b);
    const list = cols.current;
    list?.addEventListener("transitionend", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      list?.removeEventListener("transitionend", schedule);
      window.removeEventListener("resize", schedule);
    };
    // highlights/isWide read refs; anchored follows comments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column, focused, shift, comments, text]);

  // The window is as tall as the comment on show; the link line follows it.
  useLayoutEffect(() => {
    const b = body.current;
    if (!b || column) return;
    let frame = 0;
    function layout() {
      const slide = view.current?.querySelector<HTMLElement>(
        `[data-card="${selectedId}"]`,
      );
      if (view.current && slide)
        view.current.style.height = `${slide.offsetHeight}px`;
      stick();
      draw(slide);
    }
    // Wide, long answers: the column sticks with the slider at the top (score card
    // scrolled away above it), but only while the slider fits the screen.
    function stick() {
      const root = b!.parentElement!;
      const r = rail.current;
      let on = false;
      if (isWide() && r && slider.current) {
        const top =
          parseFloat(
            getComputedStyle(root).getPropertyValue("--cma-sticky-top"),
          ) || 84;
        const box = r.getBoundingClientRect();
        const lead = slider.current.getBoundingClientRect().top - box.top;
        on = box.height - lead + top + 16 <= window.innerHeight;
        if (on)
          r.style.setProperty("--cma-rail-top", `${Math.round(top - lead)}px`);
      }
      if (on) root.dataset.sticky = "";
      else delete root.dataset.sticky;
    }
    function draw(slide: HTMLElement | null | undefined) {
      const svg = link.current;
      if (!svg) return;
      const [main, tail] = svg.querySelectorAll("path");
      const dot = svg.querySelector("circle")!;
      const rects =
        isWide() && selectedId !== null
          ? highlights(selectedId).flatMap((el) => [...el.getClientRects()])
          : [];
      const band = slide?.querySelector("[data-band]");
      if (!rects.length || !band || !slider.current || !page.current) {
        svg.style.display = "none";
        return;
      }
      svg.style.display = "";
      const r = rects.reduce((a, c) => (c.right > a.right ? c : a));
      const o = b!.getBoundingClientRect();
      const bandBox = band.getBoundingClientRect();
      const x1 = Math.round(
        slider.current.getBoundingClientRect().left - o.left,
      );
      const y1 = Math.round(bandBox.top + bandBox.height / 2 - o.top);
      const x2 = Math.round(r.right - o.left);
      // Mid-gap under the highlight's line, so the line never reads as an underline.
      const y2 = Math.round(r.bottom + 2 - o.top);
      const edge = Math.round(
        page.current.getBoundingClientRect().right - o.left,
      );
      const xm = Math.round((edge + x1) / 2);
      svg.setAttribute(
        "viewBox",
        `0 0 ${Math.round(o.width)} ${Math.round(o.height)}`,
      );
      main.setAttribute(
        "d",
        y1 === y2 ? `M${x1} ${y2}H${edge}` : `M${x1} ${y1}H${xm}V${y2}H${edge}`,
      );
      tail.setAttribute("d", `M${edge} ${y2}H${x2}`);
      dot.setAttribute("cx", `${x2}`);
      dot.setAttribute("cy", `${y2}`);
    }
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    layout();
    const observer = new ResizeObserver(schedule);
    observer.observe(b);
    view.current
      ?.querySelectorAll("[data-card]")
      .forEach((slide) => observer.observe(slide));
    // A sticky slider moves against the text while scrolling.
    document.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [selectedId, comments, text, column]);

  const owner = (piece: Piece) => {
    const covering = piece.comments.map((i) => anchored[i]);
    return (
      covering.find((c) => c.id === activeId) ??
      [...covering].sort(innermost)[0]
    );
  };
  const tone = (c: NumberedComment) =>
    c.kind === "strength" ? "earned" : "missed";
  const linkTone = selected ? `is-${tone(selected)}` : undefined;

  return (
    <div className={cn("cma", flush && "cma--flush", column && "cma--column")}>
      <div ref={body} className="cma-body">
        <div ref={page} className="cma-page">
          <div className="cma-answer">
            <div className="cma-answer-hd">
              <h2>Your answer, marked</h2>
              {anchored.length > 0 && (
                <p className="cma-key">
                  <span className="sr-only">Highlight key: </span>
                  <span className="cma-key-earned">Strength</span>
                  <span className="cma-key-missed">Fix</span>
                </p>
              )}
            </div>
            {anchored.length > 0 && (
              <p className="cma-hint">
                {column
                  ? "Select a highlight to focus its comment."
                  : "Select a highlight to see its comment."}
              </p>
            )}
            {note && <p className="cma-note">{note}</p>}
            <div
              ref={doc}
              className="cma-text"
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                const id = (e.target as HTMLElement).dataset.anchors?.split(
                  " ",
                )[0];
                if (!id) return;
                e.preventDefault();
                if (column) focusComment(Number(id), "text", true);
                else go(Number(id), { reveal: true, focus: true });
              }}
            >
              {answerParagraphs(text, anchored).map((pieces) => (
                <p key={pieces[0].start}>
                  {pieces.map((piece) => {
                    if (!piece.comments.length)
                      return <Uncertain key={piece.start} text={piece.text} />;
                    const covering = piece.comments
                      .map((i) => anchored[i])
                      .sort(innermost);
                    const first = covering.find((c) => c.start === piece.start);
                    return (
                      <mark
                        key={piece.start}
                        data-anchors={covering.map((c) => c.id).join(" ")}
                        role={first ? "button" : undefined}
                        tabIndex={first ? 0 : undefined}
                        aria-label={first ? label(first) : undefined}
                        className={`cma-hl cma-hl--${tone(owner(piece))}`}
                      >
                        <Uncertain text={piece.text} />
                      </mark>
                    );
                  })}
                </p>
              ))}
            </div>
          </div>
        </div>
        <div ref={rail} className="cma-rail">
          {score && (
            <aside className="cma-score" aria-label={score.label}>
              <div className="cma-score-hd">
                <p className="cma-total">
                  {score.mark}
                  <span>/{score.max} marks</span>
                </p>
                <p className="cma-gain">
                  {score.gain > 0 ? `${score.gain} to gain` : "Full marks"}
                </p>
              </div>
              {score.tags.length > 0 && (
                <p className="cma-score-meta">
                  {score.tags.map((t) => (
                    <span key={t} className="cma-tag">
                      {t}
                    </span>
                  ))}
                </p>
              )}
              {score.note && <p className="cma-score-note">{score.note}</p>}
              {(score.earned.length > 0 ||
                score.missing.length > 0 ||
                (score.next && score.gain > 0)) && (
                <ul className="cma-crit" aria-label="Marking points">
                  {score.earned.map((t, i) => (
                    <li key={`e${i}`} className="cma-crit-earned">
                      <div className="cma-crit-row">
                        <Check className="ic" />
                        <span className="cma-crit-t">{t}</span>
                        <span className="cma-crit-s">Earned</span>
                      </div>
                    </li>
                  ))}
                  {score.missing.map((t, i) => (
                    <li key={`m${i}`} className="cma-crit-missed">
                      <div className="cma-crit-row">
                        <Close className="ic" />
                        <span className="cma-crit-t">{t}</span>
                        <span className="cma-crit-s">Missed</span>
                      </div>
                    </li>
                  ))}
                  {score.next && score.gain > 0 && (
                    <li
                      className="is-next"
                      data-selected={
                        linked && linked.id === activeId ? "true" : undefined
                      }
                    >
                      {linked ? (
                        <button
                          type="button"
                          className="cma-crit-row"
                          aria-pressed={linked.id === activeId}
                          onClick={() =>
                            column
                              ? focusComment(linked.id, "mark", true)
                              : go(linked.id, {
                                  reveal: true,
                                  showMark: true,
                                  focus: true,
                                })
                          }
                        >
                          <NextMark text={score.next} />
                        </button>
                      ) : (
                        <div className="cma-crit-row">
                          <NextMark text={score.next} />
                        </div>
                      )}
                    </li>
                  )}
                </ul>
              )}
            </aside>
          )}
          {column && comments.length > 0 && (
            <section
              className="cma-cols"
              aria-label="Comments"
              style={shift > 0 ? { paddingBottom: shift } : undefined}
              onKeyDown={(e) => {
                if (e.key !== "Escape" || focused === null) return;
                e.preventDefault();
                setFocused(null);
                setShift(0);
              }}
            >
              <ol
                ref={cols}
                style={
                  shift ? { transform: `translateY(${shift}px)` } : undefined
                }
              >
                {commentFocus(
                  comments.map((c) => c.id),
                  focused,
                ).map(({ id, pressed, dim }, i) => {
                  const c = comments[i];
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        data-card={id}
                        data-dim={dim || undefined}
                        aria-pressed={pressed}
                        onClick={() => focusComment(id, "card")}
                        onFocus={(e) => revealCard(e.currentTarget)}
                        className={`cma-cm cma-cm--${tone(c)}`}
                      >
                        <CommentContent c={c} next={c === nextComment} inline />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="sr-only" aria-live="polite">
                {inFocus
                  ? `Comment ${inFocus.n} in focus. ${label(inFocus)}`
                  : ""}
              </p>
            </section>
          )}
          {!column && comments.length > 0 && (
            <section
              ref={slider}
              className="cma-slider"
              aria-roledescription="carousel"
              aria-label="Comments"
              onKeyDown={(e) => {
                intent.current = {
                  showMark: true,
                  focus: !!(e.target as HTMLElement).closest("[data-card]"),
                };
                slides.onKeyDown(e);
                if (!e.defaultPrevented) intent.current = null;
              }}
            >
              <div className="cma-sl-bar">
                <p className="cma-sl-count" aria-hidden>
                  <b>Comment {slides.index + 1}</b> of {slides.count}
                </p>
                <div className="cma-sl-nav">
                  {(
                    [
                      ["Previous comment", "chevron-left", -1],
                      ["Next comment", "chevron-right", 1],
                    ] as const
                  ).map(([name, icon, step]) => {
                    const disabled =
                      step < 0 ? !slides.canPrev : !slides.canNext;
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-label={name}
                        aria-disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          intent.current = { showMark: true };
                          if (step < 0) slides.prev();
                          else slides.next();
                        }}
                      >
                        <PortalIcon name={icon} className="ic" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                ref={view}
                className="cma-sl-view"
                onPointerDown={(e) => {
                  if (e.pointerType !== "mouse")
                    swipe.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerUp={(e) => {
                  const start = swipe.current;
                  swipe.current = null;
                  if (!start) return;
                  const dx = e.clientX - start.x;
                  const dy = e.clientY - start.y;
                  if (Math.abs(dx) <= 40 || Math.abs(dx) <= 1.5 * Math.abs(dy))
                    return;
                  intent.current = { showMark: true };
                  if (dx < 0) slides.next();
                  else slides.prev();
                }}
                onPointerCancel={() => (swipe.current = null)}
              >
                <div
                  className="cma-sl-track"
                  style={{ transform: `translateX(${-100 * slides.index}%)` }}
                >
                  {comments.map((c, i) => {
                    const on = c.id === selectedId;
                    return (
                      <div
                        key={c.id}
                        data-card={c.id}
                        role="group"
                        aria-roledescription="slide"
                        aria-label={`Comment ${i + 1} of ${comments.length}`}
                        aria-hidden={on ? undefined : true}
                        inert={!on}
                        tabIndex={on ? 0 : -1}
                        className={`cma-slide cma-slide--${tone(c)}`}
                      >
                        <CommentContent c={c} next={c === nextComment} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="sr-only" aria-live="polite">
                {live}
              </p>
            </section>
          )}
          {aiNote && <p className="cma-foot">{AI_NOTE}</p>}
        </div>
        {column && lines.length > 0 && (
          <svg className="cma-lines" aria-hidden>
            {lines.map((l) => {
              const c = comments.find((x) => x.id === l.id);
              const cls = cn(
                c && `is-${tone(c)}`,
                focused === l.id && "is-on",
                focused !== null && focused !== l.id && "is-dim",
              );
              return (
                <g key={l.id} className={cls}>
                  <path d={l.d} />
                  {l.tail && <path className="cma-lines-tail" d={l.tail} />}
                </g>
              );
            })}
          </svg>
        )}
        {!column && (
          <svg ref={link} className="cma-link" aria-hidden>
            <path className={linkTone} />
            <path className={cn("cma-link-tail", linkTone)} />
            <circle className={linkTone} r="3.5" />
          </svg>
        )}
      </div>
    </div>
  );
}

function NextMark({ text }: { text: string }) {
  return (
    <>
      <PortalIcon name="arrow-up-right" className="ic" />
      <span className="cma-crit-t">
        <b>Your next mark:</b> {text}
      </span>
    </>
  );
}

/** One comment's band and body. `inline` uses spans so it can sit inside a column button. */
function CommentContent({
  c,
  next,
  inline = false,
}: {
  c: NumberedComment;
  next: boolean;
  inline?: boolean;
}) {
  const P = inline ? "span" : "p";
  const Div = inline ? "span" : "div";
  return (
    <>
      <P className="cma-band" data-band>
        <span className="cma-state">
          {c.kind === "strength" ? (
            <Check className="ic" />
          ) : (
            <Close className="ic" />
          )}
          {c.kind === "strength" ? "Strength" : "Fix"}
        </span>
        {c.tag && (
          <>
            <span className="sr-only">: </span>
            <span className="cma-cm-title">{c.tag}</span>
          </>
        )}
      </P>
      <Div className="cma-cm-body">
        <P className="cma-cm-quote">
          {c.start === null ? (
            "Overall"
          ) : (
            <>
              <span className="sr-only">About the words </span>“{c.quote}”
            </>
          )}
        </P>
        <P className="cma-cm-text">{c.body}</P>
        {c.next_mark && (
          <Div className="cma-fix">
            <P className="cma-fix-hd">
              <PortalIcon name="arrow-up-right" className="ic" />
              {next ? "Your next mark" : "How to get this mark"}
              <span className="sr-only">: </span>
            </P>
            <P className="cma-fix-tx">{c.next_mark}</P>
          </Div>
        )}
      </Div>
    </>
  );
}
