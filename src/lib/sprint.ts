import { modes, type Mode } from "./practice";

/** §3.2 Topic Sprint setup: the config sent to sprint_pool / start_sprint. */
export type History =
  "prefer_new" | "new_only" | "mistakes" | "flagged" | "any";
export type Difficulty = "foundation" | "standard" | "challenging";
export type SetupConfig = {
  mode: Mode;
  topics: string[];
  subtopics: string[];
  size_by: "marks" | "questions";
  target: number;
  mcq_count: number;
  short_marks: number;
  difficulty: Difficulty[];
  verbs: string[];
  year_from: number | null;
  year_to: number | null;
  origins: ("nesa" | "a1")[];
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
  any: number;
  new: number;
  mistakes: number;
  flagged: number;
  topics: Record<string, number>;
  subtopics: Record<string, number>;
  all_subtopics: number;
  verbs: Record<string, number>;
  difficulty: Partial<Record<Difficulty, number>>;
  all_years: number;
  years: [number, number];
  trial: boolean;
};

type Size = { min: number; max: number; step: number; presets: number[] };
export const SIZES: Record<string, Size> = {
  "mcq:questions": { min: 5, max: 40, step: 1, presets: [10, 20, 30, 40] },
  "short:marks": { min: 10, max: 60, step: 5, presets: [15, 30, 45, 60] },
  "short:questions": { min: 2, max: 15, step: 1, presets: [3, 5, 8, 10] },
  "mixed:marks": { min: 20, max: 100, step: 5, presets: [30, 45, 60, 80, 100] },
};
const DEFAULT_SIZE: Record<string, number> = {
  "mcq:questions": 20,
  "short:marks": 30,
  "short:questions": 5,
  "mixed:marks": 45,
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
  short_marks: 10,
  difficulty: [],
  verbs: [],
  year_from: null,
  year_to: null,
  origins: [],
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

/** Switching type restores that type's last size (else its default); MC drops written-only filters. */
export function withMode(c: SetupConfig, mode: Mode): SetupConfig {
  const size_by = mode === "short" || mode === "mixed" ? "marks" : "questions";
  const written = mode === "short" || mode === "mixed";
  const sizes = remember(c);
  return {
    ...c,
    mode,
    order: "exam",
    size_by,
    sizes,
    ...mixedSize(sizeFor(sizes, `${mode}:${size_by}`)),
    difficulty: written ? c.difficulty : [],
    verbs: written ? c.verbs : [],
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
/** Total changes start with an even split; an odd mark goes to MC. */
function mixedSize(target: number) {
  return {
    target,
    mcq_count: Math.ceil(target / 2),
    short_marks: Math.floor(target / 2),
  };
}
export function withTarget(c: SetupConfig, target: number): SetupConfig {
  return { ...c, ...mixedSize(clampTarget(c, target)) };
}
/** Linked mixed inputs: zero is allowed, but counts never spill into the other bucket. */
export function withMixedCount(
  c: SetupConfig,
  bucket: "mcq_count" | "short_marks",
  value: number,
): SetupConfig {
  const count = Math.min(
    c.target,
    Math.max(0, Number.isFinite(value) ? Math.round(value) : 0),
  );
  return {
    ...c,
    [bucket]: count,
    [bucket === "mcq_count" ? "short_marks" : "mcq_count"]: c.target - count,
  };
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
        ? short * c.target * (c.size_by === "marks" ? 1 : 3)
        : mc * c.mcq_count + short * c.short_marks;
  return Math.round(base);
}

/** Count of "More filters" in use, for the collapsed header. */
export const filtersOn = (c: SetupConfig) =>
  [
    c.difficulty.length,
    c.verbs.length,
    c.year_from ?? c.year_to,
    c.origins.length,
  ].filter(Boolean).length;

const HISTORY: History[] = [
  "prefer_new",
  "new_only",
  "mistakes",
  "flagged",
  "any",
];
const list = (v: string | null) =>
  v ? [...new Set(v.split(",").filter(Boolean))] : [];

/** URL prefill (type, topics, sub, history, verb, size) wins over the saved setup. */
export function fromParams(
  p: Record<string, string | undefined>,
  base: SetupConfig,
): SetupConfig | null {
  if (!["type", "topics", "sub", "history", "verb", "size"].some((k) => p[k]))
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
  if (p.verb && c.mode !== "mcq") c.verbs = list(p.verb);
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
  values.verbs = values.verbs.slice(0, 20);
  values.difficulty = values.difficulty.filter((d) =>
    ["foundation", "standard", "challenging"].includes(d),
  );
  values.origins = values.origins.filter((o) => ["nesa", "a1"].includes(o));
  values.history = HISTORY.includes(values.history)
    ? values.history
    : DEFAULTS.history;
  values.feedback = ["end", "each"].includes(values.feedback)
    ? values.feedback
    : DEFAULTS.feedback;
  if (!SIZES[`${mode}:${values.size_by}`])
    values.size_by = mode === "mcq" ? "questions" : "marks";
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
  if (
    c.mode === "mixed" &&
    typeof s.mcq_count === "number" &&
    Number.isFinite(s.mcq_count)
  )
    c = withMixedCount(c, "mcq_count", s.mcq_count);
  else if (
    c.mode === "mixed" &&
    typeof s.short_marks === "number" &&
    Number.isFinite(s.short_marks)
  )
    c = withMixedCount(c, "short_marks", s.short_marks);
  return c;
}

export const HISTORY_LABELS: Record<History, string> = {
  prefer_new: "Prefer new",
  new_only: "New only",
  mistakes: "Mistakes only",
  flagged: "Flagged only",
  any: "Any",
};

/** Summary line 1: "20 questions · 20 marks · 20 min · Economic Issues (Inflation) · 2018–2025 · Prefer new". */
export function summary(
  c: SetupConfig,
  names: Record<string, string>,
  years: [number, number] | null,
) {
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const size =
    c.mode === "mcq"
      ? `${n(c.target, "question")} · ${n(c.target, "mark")}`
      : c.mode === "mixed"
        ? `${n(c.target, "mark")} · ${c.mcq_count} multis + ${c.short_marks} marks of shorts`
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
  const from = c.year_from ?? years?.[0];
  const to = c.year_to ?? years?.[1];
  return [
    size,
    minutes === null ? "Untimed" : `${minutes} min`,
    topics,
    from && to ? (from === to ? `${from}` : `${from}–${to}`) : null,
    HISTORY_LABELS[c.history],
  ]
    .filter(Boolean)
    .join(" · ");
}
