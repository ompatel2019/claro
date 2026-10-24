import { modes, type Mode } from "./practice";

/** §3.2 Topic Sprint setup: the config sent to sprint_pool / start_sprint. */
export type History =
  "prefer_new" | "new_only" | "mistakes" | "flagged" | "any";
export type SetupConfig = {
  mode: Mode;
  topics: string[];
  subtopics: string[];
  size_by: "marks" | "questions";
  target: number;
  mcq_count: number;
  short_count: number;
  marks_per_short: number | null;
  history: History;
  order: "exam";
  timed: boolean;
  short_min_per_mark: number;
  mcq_min_per_q: number;
  on_timeout: "overtime";
  feedback: "end" | "each";
  /** Last size picked per "type:size_by", so switching type and back keeps it (setup only). */
  sizes?: Record<string, number>;
};
export type Pool = {
  questions: number;
  marks: number;
  mcq_questions?: number;
  mcq_new?: number;
  short_marks?: number;
  short_questions?: number;
  short_mark_values?: Record<string, number>;
  any: number;
  new: number;
  mistakes: number;
  flagged: number;
  topics: Record<string, number>;
  subtopics: Record<string, number>;
  all_subtopics: number;
};

type Size = { min: number; max: number };
export const SIZES: Record<string, Size> = {
  "mcq:questions": { min: 5, max: 40 },
  "short:marks": { min: 10, max: 60 },
  "short:questions": { min: 2, max: 15 },
  "mixed:questions": { min: 5, max: 55 },
};
const DEFAULT_SIZE: Record<string, number> = {
  "mcq:questions": 20,
  "short:marks": 30,
  "short:questions": 5,
  "mixed:questions": 15,
};
export const size = (c: Pick<SetupConfig, "mode" | "size_by">) =>
  SIZES[`${c.mode}:${c.size_by}`];

export const DEFAULTS: SetupConfig = {
  mode: "mcq",
  topics: [],
  subtopics: [],
  size_by: "questions",
  target: 20,
  mcq_count: 10,
  short_count: 5,
  marks_per_short: null,
  history: "prefer_new",
  order: "exam",
  timed: true,
  short_min_per_mark: 1.5,
  mcq_min_per_q: 1,
  on_timeout: "overtime",
  feedback: "end",
};

const remember = (c: SetupConfig) => ({
  ...c.sizes,
  [`${c.mode}:${c.size_by}`]: c.target,
});
const sizeFor = (sizes: Record<string, number>, key: string) =>
  SIZES[key] && typeof sizes[key] === "number"
    ? Math.min(SIZES[key].max, Math.max(SIZES[key].min, sizes[key]))
    : DEFAULT_SIZE[key];

/** Switching type restores that type's last size (else its default); MC drops marks per short. */
export function withMode(c: SetupConfig, mode: Mode): SetupConfig {
  const size_by = mode === "short" ? "marks" : "questions";
  const written = mode === "short" || mode === "mixed";
  const sizes = remember(c);
  return {
    ...c,
    mode,
    order: "exam",
    size_by,
    sizes,
    ...mixedSize(sizeFor(sizes, `${mode}:${size_by}`)),
    marks_per_short: written ? c.marks_per_short : null,
  };
}
export function withSizeBy(c: SetupConfig, size_by: SetupConfig["size_by"]) {
  const sizes = remember(c);
  return {
    ...c,
    size_by,
    sizes,
    ...mixedSize(sizeFor(sizes, `${c.mode}:${size_by}`)),
  };
}
/** Presets split question counts; each bucket stays within its own limit. */
function mixedSize(target: number) {
  const short_count = Math.min(15, Math.floor(target / 3));
  return { target, mcq_count: Math.min(40, target - short_count), short_count };
}
export function withTarget(c: SetupConfig, target: number): SetupConfig {
  return { ...c, ...mixedSize(clampTarget(c, target)) };
}
/** Independent buckets, with at least five questions in total. */
export function withMixedCount(
  c: SetupConfig,
  bucket: "mcq_count" | "short_count",
  value: number,
): SetupConfig {
  const other = bucket === "mcq_count" ? "short_count" : "mcq_count";
  const count = Math.min(
    bucket === "mcq_count" ? 40 : 15,
    Math.max(0, 5 - c[other], Number.isFinite(value) ? Math.round(value) : 0),
  );
  return { ...c, [bucket]: count, target: count + c[other] };
}
/** Any uses a three-mark estimate; the session records actual selected marks. */
export function estimatedMarks(c: SetupConfig) {
  const marks = c.marks_per_short ?? 3;
  return c.mode === "mixed"
    ? c.mcq_count + c.short_count * marks
    : c.mode === "short" && c.size_by === "questions"
      ? c.target * marks
      : c.target;
}
export function clampTarget(c: SetupConfig, n: number) {
  const s = size(c);
  return Math.min(
    s.max,
    Math.max(s.min, Math.round(Number.isFinite(n) ? n : s.min)),
  );
}

/** Editable pace limits apply equally in setup, saved settings and the start action. */
export const validPace = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0.25 && n <= 10;
export const clampPace = (n: number) =>
  Number.isFinite(n) ? Math.min(10, Math.max(0.25, n)) : 1;

/** Setup estimate; the server uses the actual marks selected when starting. */
export function estimateMinutes(c: SetupConfig): number | null {
  if (!c.timed) return null;
  const mc = c.mcq_min_per_q;
  const short = c.short_min_per_mark;
  const base =
    c.mode === "mcq"
      ? mc * c.target
      : c.mode === "short"
        ? short *
          c.target *
          (c.size_by === "marks" ? 1 : (c.marks_per_short ?? 3))
        : mc * c.mcq_count + short * c.short_count * (c.marks_per_short ?? 3);
  return Math.round(base);
}

const HISTORY: History[] = [
  "prefer_new",
  "new_only",
  "mistakes",
  "flagged",
  "any",
];
const list = (v: string | null) =>
  v ? [...new Set(v.split(",").filter(Boolean))] : [];

/** URL prefill (type, topics, sub, history, size) wins over the saved setup. */
export function fromParams(
  p: Record<string, string | undefined>,
  base: SetupConfig,
): SetupConfig | null {
  if (!["type", "topics", "sub", "history", "size"].some((k) => p[k]))
    return null;
  let c = { ...base };
  if (p.type && Object.hasOwn(modes, p.type)) c = withMode(c, p.type as Mode);
  if (p.topics !== undefined || p.sub !== undefined) {
    // Old links pass a subtopic in topics ("t3-inflation"): it implies its parent.
    const ids = [...list(p.topics ?? null), ...list(p.sub ?? null)];
    const subtopics = ids.filter((id) => id.includes("-"));
    const topics = [
      ...new Set(ids.map((id) => id.split("-")[0]).filter(Boolean)),
    ].slice(0, 2);
    c = {
      ...c,
      topics,
      subtopics: subtopics.filter((s) => topics.includes(s.split("-")[0])),
    };
  }
  if (HISTORY.includes(p.history as History)) c.history = p.history as History;
  if (p.size && Number.isFinite(Number(p.size)))
    c = withTarget(c, Number(p.size));
  return c;
}

/** Keeps only known keys with valid values, so an old or edited saved setup can't break the page. */
export function restore(saved: unknown): SetupConfig {
  if (!saved || typeof saved !== "object") return DEFAULTS;
  const s = { ...saved } as Partial<SetupConfig> & Record<string, unknown>;
  delete s.pace;
  delete s.custom_minutes;
  const mode = s.mode && Object.hasOwn(modes, s.mode) ? s.mode : DEFAULTS.mode;
  const values = Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, fallback]) => {
      const value = s[key];
      const valid = Array.isArray(fallback)
        ? Array.isArray(value)
          ? [...new Set(value.filter((v) => typeof v === "string"))]
          : fallback
        : typeof fallback === "number"
          ? typeof value === "number" && Number.isFinite(value)
            ? value
            : fallback
          : fallback === null
            ? value === null ||
              (typeof value === "number" && Number.isInteger(value))
              ? value
              : fallback
            : typeof value === typeof fallback
              ? value
              : fallback;
      return [key, valid];
    }),
  ) as SetupConfig;
  values.topics = values.topics.slice(0, 2);
  values.subtopics = values.subtopics.slice(0, 40);
  values.history = HISTORY.includes(values.history)
    ? values.history
    : DEFAULTS.history;
  values.feedback = ["end", "each"].includes(values.feedback)
    ? values.feedback
    : DEFAULTS.feedback;
  if (!SIZES[`${mode}:${values.size_by}`])
    values.size_by = mode === "short" ? "marks" : "questions";
  const sizes =
    s.sizes && typeof s.sizes === "object" && !Array.isArray(s.sizes)
      ? Object.fromEntries(
          Object.entries(s.sizes).filter(
            ([key, value]) =>
              SIZES[key] && typeof value === "number" && Number.isFinite(value),
          ),
        )
      : undefined;
  let c = withMode(
    {
      ...values,
      mode,
      sizes,
      on_timeout: "overtime",
      short_min_per_mark: validPace(s.short_min_per_mark)
        ? s.short_min_per_mark
        : 1.5,
      mcq_min_per_q: validPace(s.mcq_min_per_q) ? s.mcq_min_per_q : 1,
    },
    mode,
  );
  if (s.size_by && SIZES[`${mode}:${s.size_by}`]) c = withSizeBy(c, s.size_by);
  if (typeof s.target === "number" && Number.isFinite(s.target))
    c = withTarget(c, s.target);
  c.marks_per_short =
    Number.isInteger(s.marks_per_short) &&
    Number(s.marks_per_short) >= 1 &&
    Number(s.marks_per_short) <= 100
      ? Number(s.marks_per_short)
      : null;
  if (mode === "mixed") {
    // Old mark budgets become approximate question counts when reopened in setup.
    const legacy =
      typeof s.short_count !== "number" && typeof s.short_marks === "number";
    const shorts = legacy
      ? Math.round(Number(s.short_marks) / (c.marks_per_short ?? 3))
      : s.short_count;
    // Normalize both buckets before enforcing the minimum total.
    if (typeof shorts === "number" && Number.isFinite(shorts))
      c.short_count = Math.min(15, Math.max(0, Math.round(shorts)));
    if (typeof s.mcq_count === "number" && Number.isFinite(s.mcq_count))
      c.mcq_count = Math.min(40, Math.max(0, Math.round(s.mcq_count)));
    c = withMixedCount(c, "mcq_count", c.mcq_count);
  }
  return c;
}

export const HISTORY_LABELS: Record<History, string> = {
  prefer_new: "Prefer new",
  new_only: "New only",
  mistakes: "Mistakes only",
  flagged: "Flagged only",
  any: "Any",
};

/** Summary line 1: "20 questions · 20 marks · 20 min · Economic Issues (Inflation) · Prefer new". */
export function summary(c: SetupConfig, names: Record<string, string>) {
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const size =
    c.mode === "mcq"
      ? `${n(c.target, "question")} · ${n(c.target, "mark")}`
      : c.mode === "mixed"
        ? `${n(c.target, "question")} · ${c.mcq_count} multis + ${c.short_count} shorts · ${c.marks_per_short === null ? "about " : ""}${estimatedMarks(c)} marks`
        : c.size_by === "questions"
          ? n(c.target, "question")
          : n(c.target, "mark");
  const minutes = estimateMinutes(c);
  const topics = c.topics.length
    ? c.topics
        .map((t) => {
          const subs = c.subtopics.filter((s) => s.startsWith(`${t}-`));
          return subs.length
            ? `${names[t]} (${subs.map((s) => names[s]).join(", ")})`
            : names[t];
        })
        .join(" · ")
    : "Whole course";
  return [
    size,
    minutes === null ? "Untimed" : `${minutes} min`,
    topics,
    HISTORY_LABELS[c.history],
  ]
    .filter(Boolean)
    .join(" · ");
}
