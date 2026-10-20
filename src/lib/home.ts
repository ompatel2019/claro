import { timer } from "./practice";

import { HSC_EXAM, examDaysLeft } from "./hsc-exam";
import { addDays } from "./activity";
import { sydneyToday } from "./flashcards";

const SYDNEY = "Australia/Sydney";

/** "Good morning" before 12, afternoon before 17, else evening (Sydney time). */
export function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}

/** "Friday 9 October". */
export const longDate = (now = new Date()) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY,
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(now)
    .replace(",", "");

/** Paused sessions retain saved elapsed time. Recency uses started_at because
 * the runner only persists elapsed_s; only recent sessions show a timer. */
export function continueTime(
  session: {
    started_at: string;
    elapsed_s: number | null;
  },
  limit: number | null,
  now: Date,
) {
  const started = Date.parse(session.started_at);
  const remaining = (limit ?? 0) - (session.elapsed_s ?? 0);
  if (remaining > 0 && now.getTime() - started <= 30 * 60_000)
    return `${timer(remaining)} left`;
  const minutes = Math.max(0, Math.floor((now.getTime() - started) / 60_000));
  if (minutes === 0) return "Started just now";
  const relative =
    minutes < 60
      ? `${minutes}m`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h`
        : `${Math.floor(minutes / 1440)}d`;
  return `Started ${relative} ago`;
}

// NSW Eastern division student dates. Week numbers follow Monday–Sunday school weeks.
// Sources: https://education.nsw.gov.au/schooling/calendars/2026 and /2027 (19 Oct 2026).
const TERMS: Record<string, [string, string][]> = {
  "2026": [
    ["02-02", "04-02"],
    ["04-22", "07-03"],
    ["07-21", "09-25"],
    ["10-13", "12-17"],
  ],
  "2027": [
    ["02-03", "04-09"],
    ["04-29", "07-02"],
    ["07-20", "09-24"],
    ["10-12", "12-20"],
  ],
};
/** Monday-first week of an NSW term; null outside term or for an unknown year. */
export function schoolWeek(today: string) {
  const year = today.slice(0, 4);
  const terms = TERMS[year] ?? [];
  const index = terms.findIndex(
    ([start, end]) => today >= `${year}-${start}` && today <= `${year}-${end}`,
  );
  if (index < 0) return null;
  const [start, end] = terms[index].map((d) => `${year}-${d}`);
  const offset = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7;
  const week = (day: string) =>
    Math.floor(
      ((Date.parse(day) - Date.parse(start)) / 86400000 + offset) / 7,
    ) + 1;
  return { term: index + 1, week: week(today), weeks: week(end) };
}
/** Parent units only, in syllabus order; dot points must not duplicate totals. */
export function homeUnits(topics: import("./progress").TopicProgress[]) {
  return topics
    .filter((t) => t.parent_id === null)
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
}

/** Monday buckets, averaging the marked session scores supplied by the RPC.
 * Flashcard recall percentages are not marked-answer scores. Empty weeks are omitted. */
export function homeWeeks(history: import("./progress").HistoryScore[]) {
  const weeks = new Map<string, number[]>();
  for (const s of history) {
    if (
      s.kind === "flashcards" ||
      s.pct == null ||
      !Number.isFinite(s.pct) ||
      !Number.isFinite(Date.parse(s.finished_at))
    )
      continue;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: SYDNEY,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(s.finished_at));
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const monday = date.toISOString().slice(0, 10);
    weeks.set(monday, [...(weeks.get(monday) ?? []), s.pct]);
  }
  return [...weeks]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, scores]) => ({
      day,
      pct: scores.reduce((a, b) => a + b, 0) / scores.length,
    }));
}

/** Calendar-week comparison, never an invented comparison with an empty prior period. */
export function homeComparison(
  history: import("./progress").HistoryScore[],
  today: string,
) {
  const start = Date.parse(today) - 6 * 864e5;
  const previous = start - 7 * 864e5;
  const end = Date.parse(today) + 864e5;
  const rows = history.filter((s) =>
    Number.isFinite(Date.parse(s.finished_at)),
  );
  const period = (lo: number, hi: number) =>
    rows.filter((s) => {
      const day = Date.parse(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: SYDNEY,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(s.finished_at)),
      );
      return day >= lo && day < hi;
    });
  const current = period(start, end),
    prior = period(previous, start);
  const seconds = (rows: typeof history) =>
    rows.reduce(
      (n, s) => n + (Number.isFinite(s.elapsed_s) ? s.elapsed_s : 0),
      0,
    );
  const average = (rows: typeof history) => {
    const scored = rows.filter((s) => s.kind !== "flashcards" && s.pct != null);
    return scored.length
      ? scored.reduce((n, s) => n + s.pct!, 0) / scored.length
      : null;
  };
  const a = average(current),
    b = average(prior);
  return {
    minutes: prior.length
      ? Math.round((seconds(current) - seconds(prior)) / 60)
      : undefined,
    score: a != null && b != null ? Math.round(a - b) : undefined,
  };
}

/** Twenty seconds per card, two minutes per sprint question; minimum one minute. */
export const homeMinutes = (count: number, kind: "cards" | "questions") =>
  Math.max(1, Math.ceil(count * (kind === "cards" ? 1 / 3 : 2)));
export const homeShortDate = (day: string) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(new Date(day))
    .replace(",", "");

/** Saved sprint size or timer, rather than guessing how many questions remain. */
export function homeSprintMinutes(
  config: {
    time_limit_s?: number | null;
    time_limit_min?: number;
    actual_questions?: number;
    count?: number;
  },
  elapsed: number,
) {
  const seconds =
    config.time_limit_s ??
    (config.time_limit_min ? config.time_limit_min * 60 : null);
  if (seconds != null) return Math.max(1, Math.ceil((seconds - elapsed) / 60));
  const count = config.actual_questions ?? config.count;
  return count != null && count > 0 ? homeMinutes(count, "questions") : null;
}

/** Daily earned marks on Sydney dates; no comparison without prior marked work. */
export function homeEarnedMarks(
  rows: { mark: number | null; marked_at: string | null }[],
  today: string,
) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const totals = new Map(days.map((day) => [day, 0]));
  let prior = false;
  for (const row of rows) {
    if (
      row.mark == null ||
      !Number.isFinite(row.mark) ||
      !row.marked_at ||
      !Number.isFinite(Date.parse(row.marked_at))
    )
      continue;
    const day = sydneyToday(new Date(row.marked_at));
    if (!totals.has(day)) continue;
    totals.set(day, totals.get(day)! + row.mark);
    if (day < days[7]) prior = true;
  }
  const daily = days.map((day) => totals.get(day)!);
  return {
    values: daily.slice(7),
    delta: prior
      ? daily.slice(7).reduce((a, b) => a + b, 0) -
        daily.slice(0, 7).reduce((a, b) => a + b, 0)
      : undefined,
  };
}

export function homeExamPrompt(today: string) {
  const days = examDaysLeft(today);
  const when =
    days != null && days <= 7
      ? `${new Intl.DateTimeFormat("en-AU", { timeZone: SYDNEY, weekday: "long" }).format(new Date(HSC_EXAM.startsAt))}'s`
      : "my";
  return `What should I study before ${when} exam?`;
}
