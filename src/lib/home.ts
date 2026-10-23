import { addDays, type ActivityDay } from "./activity";
import type { ProgressData, TopicProgress } from "./progress";
import { timer } from "./practice";

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
// Sources: https://education.nsw.gov.au/schooling/calendars/2026 and /2027 (23 Oct 2026).
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
    ["10-11", "12-17"],
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

const STUDY_QUOTES = [
  "A little practice today makes tomorrow clearer.",
  "One question is a good place to start.",
  "Make room for the things you do not understand yet.",
  "Progress comes from coming back.",
  "Learn the reason, then try again.",
  "Small steps count. Keep taking them.",
  "Give your next answer your full attention.",
] as const;

/** Original study prompts, rotating by Sydney calendar date, independent of render time. */
export function studyQuote(today: string) {
  const day = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86400000);
  return STUDY_QUOTES[
    ((day % STUDY_QUOTES.length) + STUDY_QUOTES.length) % STUDY_QUOTES.length
  ];
}

export const WEEKLY_PRACTICE_GOAL = 5;
export const NEXT_STEP_MIN_ANSWERS = 3;

/** Prefer a supported broad topic; use a dot point if only it has enough marks. */
export function nextStepTopic(data: ProgressData | null): TopicProgress | null {
  const eligible = (data?.topics ?? []).filter(
    (t) =>
      t.answered >= NEXT_STEP_MIN_ANSWERS &&
      t.possible > 0 &&
      Number.isFinite(t.earned) &&
      Number.isFinite(t.possible),
  );
  const parents = eligible.filter((t) => !t.parent_id);
  return (
    (parents.length ? parents : eligible).sort(
      (a, b) =>
        a.earned / a.possible - b.earned / b.possible ||
        a.sort - b.sort ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

/** activity_days already uses Sydney calendar dates. Never count future rows. */
export function practiceWeek(today: string, activity: ActivityDay[]) {
  const monday = addDays(
    today,
    -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7),
  );
  const done = new Set(
    activity
      .filter((d) => d.day <= today && d.questions + d.cards > 0)
      .map((d) => d.day),
  );
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    return {
      day,
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
      done: done.has(day),
      today: day === today,
    };
  });
}

/** As on Progress: marked-answer totals, never flashcard recall. */
export function practiceAverage(data: ProgressData | null) {
  const parents = (data?.topics ?? []).filter((t) => !t.parent_id);
  const possible = parents.reduce((n, t) => n + t.possible, 0);
  return possible > 0
    ? Math.round((100 * parents.reduce((n, t) => n + t.earned, 0)) / possible)
    : null;
}
