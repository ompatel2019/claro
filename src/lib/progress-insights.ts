import { addDays } from "./activity";
import { TAGS, type Tag } from "./feedback";
import type { TopicProgress } from "./progress";
import { isWeakTopic } from "./weak-topics";
import { sydneyDay } from "./sydney-day";

/** One bucket of the practice average chart: marks earned over marks available. */
export type TrendPoint = { day: string; pct: number | null; sessions: number };
/** One finished, marked practice session from score_history. */
export type SessionScore = {
  finished_at: string | null;
  score: number | string | null;
  max_score: number | string | null;
};

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/**
 * Finished sessions bucketed by Sydney finish day: daily up to 14 days, weekly
 * up to 26 weeks, else 30-day blocks, ending on `today`. Each bucket is the
 * share of marks earned (sum of scores over sum of marks available), so long
 * sessions count for more than short ones; empty buckets are gaps (pct null).
 */
export function practiceTrend(
  rows: SessionScore[],
  from: string | null,
  today: string,
) {
  const scored = rows.flatMap((r) => {
    const score = Number(r.score),
      max = Number(r.max_score);
    return r.finished_at &&
      Number.isFinite(Date.parse(r.finished_at)) &&
      Number.isFinite(score) &&
      Number.isFinite(max) &&
      max > 0
      ? [{ day: sydneyDay(r.finished_at), score: Math.max(0, score), max }]
      : [];
  });
  const start =
    from ?? scored.reduce((min, s) => (s.day < min ? s.day : min), today);
  const span = Math.max(1, daysBetween(start, today) + 1);
  const size = span <= 14 ? 1 : span <= 182 ? 7 : 30;
  const count = Math.ceil(span / size);
  const points = Array.from({ length: count }, (_, i) => ({
    day: addDays(today, -(count - 1 - i) * size - (size - 1)),
    sessions: 0,
    score: 0,
    max: 0,
  }));
  let sessions = 0;
  for (const s of scored) {
    const back = daysBetween(s.day, today);
    if (back < 0 || s.day < start) continue;
    const i = count - 1 - Math.floor(back / size);
    if (i < 0) continue;
    sessions++;
    points[i].sessions++;
    points[i].score += s.score;
    points[i].max += s.max;
  }
  return {
    size,
    sessions,
    points: points.map(({ day, sessions, score, max }): TrendPoint => ({
      day,
      sessions,
      pct: max ? Math.min(100, Math.round((100 * score) / max)) : null,
    })),
  };
}

/**
 * Dot points ranked by marks lost in the range. Marks on questions tagged only
 * to a whole topic (not a dot point) are kept as a row for that topic, so the
 * list accounts for every lost mark the topic table shows. Weak ones use the
 * shared weak-topic rule.
 */
export function marksLost(topics: TopicProgress[], limit = 5) {
  const round = (n: number) => Math.round(n * 10) / 10;
  const rows = topics.flatMap((t) => {
    if (t.parent_id) {
      const parent = topics.find((p) => p.id === t.parent_id);
      return [
        {
          topic: t,
          parent: parent?.name ?? null,
          earned: t.earned,
          possible: t.possible,
          whole: false,
        },
      ];
    }
    const kids = topics.filter((k) => k.parent_id === t.id);
    const earned = t.earned - kids.reduce((n, k) => n + k.earned, 0),
      possible = t.possible - kids.reduce((n, k) => n + k.possible, 0);
    return possible > 0
      ? [{ topic: t, parent: null, earned, possible, whole: true }]
      : [];
  });
  return rows
    .map(({ topic, parent, earned, possible, whole }) => ({
      topic,
      parent,
      whole,
      possible: round(possible),
      lost: round(possible - earned),
      weak: !whole && isWeakTopic(topic),
    }))
    .filter((r) => r.lost > 0)
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
