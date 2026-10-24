import { addDays } from "./activity";
import { TAGS, type Tag } from "./feedback";
import type { TopicProgress, HistoryScore } from "./progress";
import { isWeakTopic } from "./weak-topics";
import { sydneyDay } from "./sydney-day";

/** One bucket of the practice average chart: the mean session score that started on `day`. */
export type TrendPoint = { day: string; pct: number | null; sessions: number };

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/**
 * Scored practice sessions (not flashcards) bucketed by Sydney day: daily up to
 * 14 days, weekly up to 26 weeks, else 30-day blocks. Buckets end on `today`;
 * a bucket with no sessions has pct null so the chart shows a gap.
 */
export function practiceTrend(
  history: HistoryScore[],
  from: string | null,
  today: string,
) {
  const scored = history.flatMap((h) =>
    h.kind !== "flashcards" &&
    h.finished_at &&
    Number.isFinite(Date.parse(h.finished_at)) &&
    typeof h.pct === "number" &&
    Number.isFinite(h.pct)
      ? [
          {
            day: sydneyDay(h.finished_at),
            pct: Math.min(100, Math.max(0, h.pct)),
          },
        ]
      : [],
  );
  const start =
    from ?? scored.reduce((min, s) => (s.day < min ? s.day : min), today);
  const span = Math.max(1, daysBetween(start, today) + 1);
  const size = span <= 14 ? 1 : span <= 182 ? 7 : 30;
  const count = Math.ceil(span / size);
  const points: (TrendPoint & { sum: number })[] = Array.from(
    { length: count },
    (_, i) => ({
      day: addDays(today, -(count - 1 - i) * size - (size - 1)),
      pct: null,
      sessions: 0,
      sum: 0,
    }),
  );
  for (const s of scored) {
    const back = daysBetween(s.day, today);
    if (back < 0 || s.day < start) continue;
    const i = count - 1 - Math.floor(back / size);
    if (i < 0) continue;
    points[i].sessions++;
    points[i].sum += s.pct;
  }
  return {
    size,
    sessions: scored.filter((s) => s.day >= start && s.day <= today).length,
    points: points.map(({ sum, ...p }) => ({
      ...p,
      pct: p.sessions ? Math.round(sum / p.sessions) : null,
    })),
  };
}

/** Dot points ranked by marks lost in the range; weak ones (shared rule) are flagged. */
export function marksLost(topics: TopicProgress[], limit = 5) {
  const parents = new Map(
    topics.filter((t) => !t.parent_id).map((t) => [t.id, t.name]),
  );
  return topics
    .filter((t) => t.parent_id && t.possible > t.earned)
    .map((t) => ({
      topic: t,
      parent: parents.get(t.parent_id!) ?? null,
      lost: Math.round((t.possible - t.earned) * 10) / 10,
      weak: isWeakTopic(t),
    }))
    .sort(
      (a, b) =>
        b.lost - a.lost ||
        a.topic.sort - b.topic.sort ||
        a.topic.id.localeCompare(b.topic.id),
    )
    .slice(0, limit);
}

export const TAG_LABELS: Record<Tag, string> = {
  Verb: "Answer the command verb",
  Knowledge: "Accurate content knowledge",
  Evidence: "Specific evidence and examples",
  Analysis: "Analysis, not description",
  Terminology: "Precise terminology",
  Structure: "Answer structure",
};

/** A marked written answer's stored fix comments, as read from attempts.feedback. */
export type MarkedComments = { marked_at: string | null; comments: unknown };

/**
 * What the marker keeps asking for: tagged fix comments across marked answers,
 * counted once per answer, with the marker's own latest line for each tag.
 */
export function markerAsks(rows: MarkedComments[], limit = 4) {
  const sorted = [...rows].sort((a, b) =>
    (b.marked_at ?? "").localeCompare(a.marked_at ?? ""),
  );
  const asks = new Map<Tag, { tag: Tag; answers: number; latest: string }>();
  let answers = 0;
  for (const row of sorted) {
    if (!Array.isArray(row.comments)) continue;
    answers++;
    const seen = new Set<Tag>();
    for (const c of row.comments as Record<string, unknown>[]) {
      if (!c || (c.kind ?? c.type) === "strength") continue;
      const tag = c.tag as Tag;
      if (!TAGS.includes(tag) || seen.has(tag)) continue;
      const line = [c.next_mark, c.body, c.comment].find(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      );
      if (!line) continue;
      seen.add(tag);
      const hit = asks.get(tag);
      if (hit) hit.answers++;
      else asks.set(tag, { tag, answers: 1, latest: line.trim() });
    }
  }
  return {
    answers,
    asks: [...asks.values()]
      .sort(
        (a, b) =>
          b.answers - a.answers || TAGS.indexOf(a.tag) - TAGS.indexOf(b.tag),
      )
      .slice(0, limit),
  };
}

/** Dot points with any answered question in the range, out of all dot points. */
export function coverage(topics: TopicProgress[]) {
  const dots = topics.filter((t) => t.parent_id);
  return {
    practised: dots.filter((t) => t.answered > 0).length,
    total: dots.length,
  };
}
