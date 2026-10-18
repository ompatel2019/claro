import { timer, modeLabel, topicNames } from "./practice";

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

/** One session title for history and resume cards, using the shared mode/topic labels. */
export function sessionTitle(
  session: {
    kind?: string;
    config: { mode?: string; topics?: string[]; subtopics?: string[] };
  },
  topics: import("./practice").Topic[],
) {
  if (session.kind === "single") return "Mark my answer";
  if (session.kind === "flashcards")
    return `Flashcards · ${session.config.mode === "test" ? "Test" : "Study"}`;
  const ids = session.config.subtopics?.length
    ? session.config.subtopics
    : session.config.topics;
  return `${modeLabel(session.config.mode)} sprint · ${topicNames(ids, topics)}`;
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
export function schoolWeek(today: string) {
  const year = today.slice(0, 4);
  const terms = TERMS[year];
  if (!terms) return "Your study week";
  const index = terms.findIndex(
    ([start, end]) => today >= `${year}-${start}` && today <= `${year}-${end}`,
  );
  if (index < 0) return "School break";
  const start = new Date(`${year}-${terms[index][0]}T00:00:00Z`);
  const offset = (start.getUTCDay() + 6) % 7;
  const week =
    Math.floor(
      ((Date.parse(today) - start.getTime()) / 86400000 + offset) / 7,
    ) + 1;
  return `Term ${index + 1} · Week ${week}`;
}
const QUOTES = [
  "One question is a good place to start.",
  "Small steps make steady progress.",
  "Give your next answer your full attention.",
  "Make a little room for practice today.",
  "Learn from the answer, then try again.",
  "Build a habit, one study day at a time.",
  "A short session still counts.",
];
export function dailyQuote(today: string) {
  return QUOTES[Math.floor(Date.parse(today) / 86400000) % QUOTES.length];
}
