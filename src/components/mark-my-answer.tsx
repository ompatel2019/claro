"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MarkingScreen } from "./marking-screen";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  createCheck,
  finishCheck,
  restoreUnreadableCheck,
} from "@/app/(app)/student/mark/actions";
import { createClient } from "@/utils/supabase/client";
import { withAuthRetry } from "@/lib/auth-client";
import {
  answerValid,
  filterBankQuestions,
  detectVerb,
  NESA_VERBS,
  ownQuestionSchema,
  type BankQuestion,
  type OwnQuestion,
} from "@/lib/single-check";
import type { Attempt, Topic } from "@/lib/practice";
import { WrittenAnswer } from "./written-answer";
import {
  MARK_MY_ANSWER_DAILY_LIMIT,
  LONG_PHOTO_PAGE_LIMIT,
  WRITTEN_WORD_LIMIT,
  wordGuide,
} from "@/lib/limits";
import { Button } from "./ui/button";
import { PortalIcon } from "./icons";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

function Choice({
  label,
  value,
  items,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p
        className={
          label === "Type" || label === "Topic" || label === "Year"
            ? "sr-only"
            : "text-sm font-medium"
        }
      >
        {label}
      </p>
      <Select
        value={value}
        onValueChange={(v) => v !== null && onChange(v)}
        disabled={disabled}
        items={items}
      >
        <SelectTrigger aria-label={label} className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
const emptyAnswer = {
  id: "draft",
  question_id: "",
  position: 1,
  choice_index: null,
  answer_text: null,
  transcript: null,
  image_paths: null,
  flagged: false,
  status: "pending",
  mark: null,
  max_marks: null,
  band: null,
  feedback: null,
} satisfies Omit<Attempt, "question">;
export function MarkMyAnswer({
  questions,
  initialQuestionId,
  defaultQuestionId,
  topics,
  userId,
  left,
  initial,
  allowOwnQuestion = false,
  allowAutofill = false,
}: {
  questions: BankQuestion[];
  initialQuestionId?: string;
  defaultQuestionId?: string;
  topics: Topic[];
  userId: string;
  left: number;
  allowOwnQuestion?: boolean;
  allowAutofill?: boolean;
  initial?: {
    sessionId: string;
    attempt: Omit<Attempt, "question">;
    question?: OwnQuestion;
    questionId?: string;
  };
}) {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [restored, setRestored] = useState(false);
  const draftKey = `claro.single.${userId}`;
  const [source, setSource] = useState(initial?.question ? "own" : "bank");
  const [selected, setSelected] = useState(
    initial?.questionId ?? initialQuestionId ?? defaultQuestionId ?? "",
  );
  const [search, setSearch] = useState("");
  const [bankOpen, setBankOpen] = useState(true);
  const [activeOption, setActiveOption] = useState(0);
  const bankListId = useId();
  const [type, setType] = useState("all");
  const [topic, setTopic] = useState("all");
  const [year, setYear] = useState("all");
  const [own, setOwn] = useState<OwnQuestion>(
    initial?.question ?? {
      stem: "",
      marks: 0,
      verb: "",
      topic_id: null,
      criteria_text: "",
    },
  );
  const ownRef = useRef(own);
  useEffect(() => {
    ownRef.current = own;
  }, [own]);
  const edited = useRef({
    marks: false,
    topic_id: false,
    criteria_text: false,
    verb: false,
  });
  const lastAutofill = useRef("");
  const autofillPending = useRef(false);
  const autofillQueued = useRef(false);
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState("");
  const [mode, setMode] = useState<"type" | "photo">(
    initial?.attempt.image_paths?.length ? "photo" : "type",
  );
  const [answer, setAnswer] = useState<Omit<Attempt, "question">>(
    initial?.attempt ?? emptyAnswer,
  );
  const answerRef = useRef(answer);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inputBusy, setInputBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [remaining, setRemaining] = useState(left);
  const created = useRef<{ sessionId: string; attemptId: string } | null>(
    initial
      ? { sessionId: initial.sessionId, attemptId: initial.attempt.id }
      : null,
  );
  const [submitted, setSubmitted] = useState(false);
  const creating = useRef<Promise<{
    sessionId: string;
    attemptId: string;
  }> | null>(null);
  const question =
    source === "bank"
      ? questions.find((q) => q.id === selected)
      : {
          id: "own",
          stem: own.stem,
          marks: own.marks || 1,
          type: own.marks > 8 ? ("extended" as const) : ("short" as const),
          topic_id: own.topic_id ?? "",
          stimulus: null,
          options: null,
          source: "Your question",
          year: null,
        };
  const validQuestion =
    source === "bank" ? !!question : ownQuestionSchema.safeParse(own).success;
  const valid =
    validQuestion &&
    answerValid(answer, confirmed) &&
    (mode !== "photo" || !!answer.image_paths?.length) &&
    (remaining > 0 || answer.id !== "draft");
  const locked = busy || inputBusy || offline || submitted;
  const questionLocked = locked || answer.id !== "draft";
  const results = filterBankQuestions(questions, topics, {
    type,
    topic,
    year,
    search,
  }).slice(0, 30);
  const optionIndex = Math.min(activeOption, Math.max(0, results.length - 1));
  const fieldError = (field: "stem" | "marks" | "criteria_text") => {
    if (!touched[field]) return null;
    const parsed = ownQuestionSchema.safeParse(own);
    const issue =
      !parsed.success && parsed.error.issues.find((i) => i.path[0] === field);
    return issue ? (
      <p
        id={`${field}-error`}
        role="alert"
        className="text-destructive text-sm"
      >
        {issue.message}
      </p>
    ) : null;
  };
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const raw = initialQuestionId ? null : localStorage.getItem(draftKey);
        if (raw) {
          const draft = z
            .object({
              source: z.enum(["own", "bank"]),
              selected: z.string(),
              own: ownQuestionSchema.extend({
                stem: z.string().max(3000),
                marks: z.number().int().min(0).max(20),
              }),
              mode: z.enum(["type", "photo"]),
              answer: z.object({
                answer_text: z.string().nullable(),
                transcript: z.string().nullable(),
                image_paths: z.array(z.string()).nullable(),
              }),
              sessionId: z.string().nullable(),
            })
            .safeParse(JSON.parse(raw));
          if (draft.success && draft.data.sessionId && !initial) {
            const db = createClient();
            const { data: session, error: readError } = await db
              .from("sessions")
              .select("finished_at")
              .eq("id", draft.data.sessionId)
              .eq("user_id", userId)
              .maybeSingle();
            if (readError) {
              // Let the owned report route handle auth/network failures without overwriting the draft.
              router.replace(`/student/activity/${draft.data.sessionId}`);
              return;
            }
            if (session && !session.finished_at) {
              router.replace(`/student/activity/${draft.data.sessionId}`);
              return;
            }
            localStorage.removeItem(draftKey);
            setRestored(true);
            return;
          }
          if (
            draft.success &&
            (!initial || draft.data.sessionId === initial.sessionId)
          ) {
            // A saved session's question is immutable; only restore its answer.
            if (!initial) {
              setSource(allowOwnQuestion ? draft.data.source : "bank");
              setSelected(
                !allowOwnQuestion && draft.data.source === "own"
                  ? ""
                  : draft.data.selected,
              );
              setOwn(draft.data.own);
              edited.current = {
                marks: draft.data.own.marks > 0,
                topic_id: !!draft.data.own.topic_id,
                criteria_text: !!draft.data.own.criteria_text,
                verb: false,
              };
            }
            setMode(draft.data.mode);
            setAnswer((previous) => {
              const next = { ...previous, ...draft.data.answer };
              answerRef.current = next;
              return next;
            });
          }
        }
      } catch {
        /* Browser storage can be unavailable. */
      }
      setRestored(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [allowOwnQuestion, draftKey, initial, initialQuestionId, router, userId]);
  useEffect(() => {
    if (!restored || submitted) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          source,
          selected,
          own,
          mode,
          answer: {
            answer_text: answer.answer_text,
            transcript: answer.transcript,
            image_paths: answer.image_paths,
          },
          sessionId: created.current?.sessionId ?? null,
        }),
      );
    } catch {
      /* Keep the in-memory draft if storage is full. */
    }
  }, [restored, submitted, draftKey, source, selected, own, mode, answer]);
  async function autofill(retry = false) {
    const snapshot = ownRef.current;
    const stem = snapshot.stem.trim();
    if (
      !allowAutofill ||
      source !== "own" ||
      questionLocked ||
      offline ||
      stem.length < 10 ||
      (!retry && lastAutofill.current === stem)
    )
      return;
    if (autofillPending.current) {
      autofillQueued.current = true;
      return;
    }
    lastAutofill.current = stem;
    autofillPending.current = true;
    setFilling(true);
    setFillError("");
    try {
      const response = await fetch("/api/own-question/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stem,
          ...(edited.current.marks && snapshot.marks > 0
            ? { marks: snapshot.marks }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Autofill failed. Please retry.");
      const generated = ownQuestionSchema.parse(result);
      if (ownRef.current.stem.trim() !== stem || created.current) return;
      setOwn((current) => ({
        ...current,
        ...(!edited.current.marks ? { marks: generated.marks } : {}),
        ...(!edited.current.topic_id ? { topic_id: generated.topic_id } : {}),
        ...(!edited.current.verb ? { verb: generated.verb } : {}),
        ...(!edited.current.criteria_text &&
        (!edited.current.marks || current.marks === generated.marks)
          ? { criteria_text: generated.criteria_text }
          : {}),
      }));
    } catch (error) {
      setFillError(
        error instanceof Error
          ? error.message
          : "Autofill failed. Please retry.",
      );
    } finally {
      autofillPending.current = false;
      setFilling(false);
      if (autofillQueued.current) {
        autofillQueued.current = false;
        void autofill();
      }
    }
  }
  function patch(p: Partial<Attempt>) {
    answerRef.current = { ...answerRef.current, ...p };
    setAnswer(answerRef.current);
  }
  async function ensureCreated() {
    if (created.current) return created.current;
    if (!validQuestion)
      throw new Error("Complete your question before uploading an answer.");
    creating.current ??= createCheck(
      source === "bank"
        ? { source, question_id: selected }
        : { source, question: own },
    ).then((result) => {
      if ("error" in result) throw new Error(result.error);
      return result;
    });
    try {
      const result = await creating.current;
      created.current = result;
      patch({ id: result.attemptId });
      setRemaining((n) => Math.max(0, n - 1));
      return result;
    } finally {
      creating.current = null;
    }
  }
  async function save(p: Partial<Attempt>) {
    const { attemptId } = await ensureCreated();
    if (answerRef.current.status === "unreadable") {
      const result = await restoreUnreadableCheck(attemptId);
      if (result.error) throw new Error(result.error);
      patch({ status: "transcribed" });
    }
    const db = createClient();
    await withAuthRetry(db, async () => {
      const content = { ...answerRef.current, ...p };
      const { error, data } = await db
        .from("attempts")
        .update({
          answer_text: content.answer_text,
          transcript: content.transcript,
          image_paths: content.image_paths,
        })
        .eq("id", attemptId)
        .eq("user_id", userId)
        .in("status", ["pending", "transcribed"])
        .select("id");
      if (error || !data?.length)
        throw new Error(
          error?.message ??
            "This answer is no longer editable. View your check in Recent checks.",
        );
    });
  }
  async function changeMode(next: "type" | "photo") {
    if (next === "type" && answer.image_paths?.length) {
      setInputBusy(true);
      try {
        const content = {
          answer_text: answer.transcript ?? "",
          transcript: null,
          image_paths: null,
        };
        await save(content);
        patch(content);
        setConfirmed(false);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your answer.");
        return;
      } finally {
        setInputBusy(false);
      }
    }
    setMode(next);
  }
  async function submit() {
    if (!valid || locked || filling || creating.current) return;
    setBusy(true);
    setError("");
    try {
      const { sessionId, attemptId } = await ensureCreated();
      if (!submitted) {
        await save({});
        const result = await finishCheck(sessionId);
        if (result.error) throw new Error(result.error);
        setSubmitted(true);
      }
      // The request continues on the server while the report shows its live state.
      void fetch(`/api/attempts/${attemptId}/mark`, {
        method: "POST",
        keepalive: true,
      })
        .then(() => router.refresh())
        .catch(() => router.refresh());
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      router.push(`/student/activity/${sessionId}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We couldn't mark this one. Retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {busy && <MarkingScreen single />}
      {offline && (
        <p
          role="status"
          className="bg-warning-soft mb-4 rounded-lg p-3 text-sm"
        >
          {"You're offline. We'll save when you're back."}
        </p>
      )}
      <form
        hidden={busy}
        inert={busy}
        className="ma-form"
        aria-label="Your question and answer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <section className="ma-field" aria-labelledby="ma-question-title">
          <div className="ma-field-head">
            <div>
              <h2 id="ma-question-title" className="ma-step">
                <span className="ma-step-n" aria-hidden>
                  1
                </span>
                The question
              </h2>
              <p className="text-muted-foreground mt-1 text-[13px]">
                {source === "bank"
                  ? "Pick one from the Claro bank"
                  : "Bring a question from anywhere"}
              </p>
            </div>
            {allowOwnQuestion ? (
              <ToggleGroup
                value={[source]}
                onValueChange={(v) => {
                  if (v[0]) setSource(v[0]);
                }}
                aria-label="Question source"
                className="max-w-full"
                disabled={questionLocked}
              >
                <ToggleGroupItem value="bank" aria-label="From the Claro bank">
                  Claro bank
                </ToggleGroupItem>
                <ToggleGroupItem value="own" aria-label="My own question">
                  My own
                </ToggleGroupItem>
              </ToggleGroup>
            ) : initial?.question ? (
              <p className="text-sm font-medium">Your saved question</p>
            ) : (
              <ToggleGroup value={["bank"]} aria-label="Question source">
                <ToggleGroupItem value="bank" aria-label="From the Claro bank">
                  Claro bank
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="own"
                  aria-label="My own question"
                  disabled
                >
                  My own
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
          <div className="space-y-3">
            {source === "bank" ? (
              <>
                <label className="relative grid gap-1.5 text-sm font-medium">
                  <PortalIcon
                    name="search"
                    className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4"
                  />
                  <span className="sr-only">Search questions</span>
                  <Input
                    value={search}
                    className="pl-9 font-normal"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={bankOpen && !questionLocked}
                    aria-controls={bankListId}
                    aria-activedescendant={
                      bankOpen && results[optionIndex]
                        ? `${bankListId}-${results[optionIndex].id}`
                        : undefined
                    }
                    onFocus={() => setBankOpen(true)}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setActiveOption(0);
                      setBankOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setBankOpen(true);
                        setActiveOption((i) =>
                          Math.max(
                            0,
                            Math.min(
                              results.length - 1,
                              i + (e.key === "ArrowDown" ? 1 : -1),
                            ),
                          ),
                        );
                      } else if (
                        e.key === "Enter" &&
                        bankOpen &&
                        !e.metaKey &&
                        !e.ctrlKey
                      ) {
                        e.preventDefault();
                        if (results[optionIndex]) {
                          setSelected(results[optionIndex].id);
                          setBankOpen(false);
                        }
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setBankOpen(false);
                      }
                    }}
                    placeholder="Search by question text or paper, e.g. 2023 HSC Q22"
                    disabled={questionLocked}
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Choice
                    label="Type"
                    value={type}
                    onChange={setType}
                    disabled={questionLocked}
                    items={[
                      { value: "all", label: "All types" },
                      { value: "short", label: "Short" },
                      { value: "extended", label: "Extended" },
                    ]}
                  />
                  <Choice
                    label="Topic"
                    value={topic}
                    onChange={setTopic}
                    disabled={questionLocked}
                    items={[
                      { value: "all", label: "All topics" },
                      ...topics
                        .filter((t) => !t.parent_id)
                        .map((t) => ({ value: t.id, label: t.name })),
                    ]}
                  />
                  <Choice
                    label="Year"
                    value={year}
                    onChange={setYear}
                    disabled={questionLocked}
                    items={[
                      { value: "all", label: "All years" },
                      ...[
                        ...new Set(
                          questions.flatMap((q) => (q.year ? [q.year] : [])),
                        ),
                      ]
                        .sort((a, b) => b - a)
                        .map((y) => ({ value: String(y), label: String(y) })),
                    ]}
                  />
                </div>
                {!questionLocked && (
                  <div className="overflow-hidden" hidden={!bankOpen}>
                    <p
                      role="status"
                      className="text-muted-foreground pt-1 pb-2 text-xs"
                    >
                      {results.length
                        ? `${results.length} matching questions${results.length === 30 ? " · refine your search for more" : ""}`
                        : allowOwnQuestion
                          ? "No questions match. Try another search or use your own question."
                          : "No questions match. Try another search or change your filters."}
                    </p>
                    <ul
                      id={bankListId}
                      role="listbox"
                      aria-label="Matching questions"
                      className="grid max-h-[440px] gap-1.5 overflow-y-auto px-px pb-px"
                    >
                      {results.map((q) => (
                        <li key={q.id}>
                          <button
                            type="button"
                            id={`${bankListId}-${q.id}`}
                            role="option"
                            aria-selected={selected === q.id}
                            onClick={() => {
                              setSelected(q.id);
                              setBankOpen(true);
                            }}
                            className={`hover:bg-accent flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left focus-visible:outline-2 ${selected === q.id ? "border-primary bg-primary/[0.035] ring-primary ring-1" : ""}`}
                          >
                            <span
                              aria-hidden
                              className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${selected === q.id ? "border-primary" : ""}`}
                            >
                              {selected === q.id && (
                                <span className="bg-primary size-2 rounded-full" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm leading-snug font-medium">
                                {q.stem}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {q.source} ·{" "}
                                {topics.find((t) => t.id === q.topic_id)?.name}{" "}
                                · {q.marks} marks
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="grid gap-1.5 text-sm font-medium">
                  Question text
                  <Textarea
                    rows={5}
                    maxLength={3000}
                    value={own.stem}
                    disabled={questionLocked}
                    required
                    aria-invalid={!!fieldError("stem")}
                    aria-describedby="stem-help stem-error"
                    onBlur={() => {
                      setTouched((t) => ({ ...t, stem: true }));
                      void autofill();
                    }}
                    onChange={(e) => {
                      edited.current.verb = false;
                      setOwn({
                        ...own,
                        stem: e.target.value,
                        verb: detectVerb(e.target.value),
                      });
                    }}
                  />
                  <span
                    id="stem-help"
                    className="text-muted-foreground text-xs"
                  >
                    10–3,000 characters. Paste the stimulus too.
                  </span>
                </label>
                {fieldError("stem")}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice
                    label="Marks"
                    value={String(own.marks)}
                    onChange={(v) => {
                      edited.current.marks = true;
                      setOwn({ ...own, marks: Number(v) });
                      setTouched((t) => ({ ...t, marks: true }));
                    }}
                    disabled={questionLocked}
                    items={[
                      { value: "0", label: "Choose marks" },
                      ...Array.from({ length: 20 }, (_, i) => ({
                        value: String(i + 1),
                        label: `${i + 1} ${i === 0 ? "mark" : "marks"}`,
                      })),
                    ]}
                  />
                  <Choice
                    label="Directive verb"
                    value={own.verb}
                    onChange={(v) => {
                      edited.current.verb = true;
                      setOwn({ ...own, verb: v });
                    }}
                    disabled={questionLocked}
                    items={[
                      { value: "", label: "Not sure" },
                      ...NESA_VERBS.map((v) => ({
                        value: v,
                        label: v[0].toUpperCase() + v.slice(1),
                      })),
                    ]}
                  />
                </div>
                {fieldError("marks")}
                <Choice
                  label="Topic (optional)"
                  value={own.topic_id ?? ""}
                  onChange={(v) => {
                    edited.current.topic_id = true;
                    setOwn({ ...own, topic_id: v || null });
                  }}
                  disabled={questionLocked}
                  items={[
                    { value: "", label: "No topic selected" },
                    ...topics
                      .filter((t) => t.parent_id)
                      .map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
                <label className="grid gap-1.5 text-sm font-medium">
                  Marking guidelines (optional)
                  <Textarea
                    rows={3}
                    maxLength={3000}
                    placeholder="Paste them if you have them"
                    value={own.criteria_text ?? ""}
                    disabled={questionLocked}
                    onBlur={() =>
                      setTouched((t) => ({ ...t, criteria_text: true }))
                    }
                    onChange={(e) => {
                      edited.current.criteria_text = true;
                      setOwn({ ...own, criteria_text: e.target.value });
                    }}
                  />
                </label>
                {fieldError("criteria_text")}
                {filling && <p role="status">Suggesting question details…</p>}
                {fillError && (
                  <div role="alert" className="text-sm">
                    {fillError}{" "}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void autofill(true)}
                    >
                      Retry autofill
                    </Button>
                  </div>
                )}
                <p className="text-muted-foreground text-sm">
                  {allowAutofill
                    ? "Leave the question box to suggest a topic, marks and guidelines (10 AI calls per day). Empty guidelines are generated when you submit. All suggestions are editable."
                    : "Provide clear mark bands covering every available mark. Without reliable criteria, we can’t give a mark."}
                </p>
              </>
            )}
            {answer.id !== "draft" && (
              <p className="text-muted-foreground text-xs">
                Question saved for this check. Your answer stays editable until
                you submit.
              </p>
            )}
          </div>
        </section>
        <section className="ma-field" aria-labelledby="ma-answer-title">
          <div className="ma-field-head">
            <div>
              <h2 id="ma-answer-title" className="ma-step">
                <span className="ma-step-n" aria-hidden>
                  2
                </span>
                Your answer
              </h2>
              <p className="text-muted-foreground mt-1 text-[13px]">
                Write it as you would in the exam
              </p>
            </div>
            <ToggleGroup
              value={[mode]}
              onValueChange={(v) => {
                if (v[0]) void changeMode(v[0] as "type" | "photo");
              }}
              aria-label="Answer format"
              className="ma-mode"
              disabled={locked}
            >
              <ToggleGroupItem value="type">
                <PortalIcon name="keyboard" />
                Type
              </ToggleGroupItem>
              <ToggleGroupItem value="photo">
                <PortalIcon name="camera" />
                Photo
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-3">
            {question && (
              <div className="bg-muted rounded-xl px-3.5 py-3">
                <p className="text-muted-foreground text-xs">Answering</p>
                <p className="mt-0.5 text-sm leading-snug font-medium">
                  {question.stem}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {question.marks} marks ·{" "}
                  {topics.find((t) => t.id === question.topic_id)?.name}
                </p>
              </div>
            )}
            {mode === "photo" && (
              <p className="text-muted-foreground text-sm">
                Upload up to {LONG_PHOTO_PAGE_LIMIT} pages, then read and
                confirm your transcript. Each photo must be 10 MB or less.
              </p>
            )}
            {mode === "type" ? (
              <div className="ma-booklet">
                <label className="sr-only" htmlFor="single-answer">
                  Your answer
                </label>
                <textarea
                  id="single-answer"
                  className="ma-answer"
                  placeholder="Start with the key idea, then explain how one thing leads to another."
                  value={answer.answer_text ?? ""}
                  disabled={busy || submitted || offline}
                  onChange={(e) => {
                    if (
                      e.target.value.trim().split(/\s+/).filter(Boolean)
                        .length <= WRITTEN_WORD_LIMIT ||
                      e.target.value.length < (answer.answer_text ?? "").length
                    )
                      patch({ answer_text: e.target.value });
                  }}
                />
                <div className="ma-booklet-foot">
                  <span>
                    {
                      (answer.answer_text ?? "")
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean).length
                    }{" "}
                    words
                    {source === "own" && question
                      ? ` · aim for about ${wordGuide(question.marks).join("–")}`
                      : ""}
                  </span>
                  <span>Draft saved in this browser</span>
                </div>
              </div>
            ) : (
              <WrittenAnswer
                attempt={{
                  ...answer,
                  question: question ?? {
                    id: "",
                    type: "short",
                    topic_id: "",
                    marks: 1,
                    stem: "",
                    stimulus: null,
                    options: null,
                    source: "",
                    year: null,
                  },
                }}
                userId={userId}
                edit={patch}
                local={patch}
                save={save}
                flush={async () => {
                  await save({});
                }}
                mode={mode}
                disabled={
                  busy ||
                  submitted ||
                  offline ||
                  (mode === "photo" &&
                    (!validQuestion ||
                      (remaining === 0 && answer.id === "draft")))
                }
                onBusy={setInputBusy}
                onConfirmed={setConfirmed}
                onModeChange={setMode}
                onError={setError}
              />
            )}
          </div>
        </section>
        <div className="ma-go">
          {remaining === 0 && answer.id === "draft" && (
            <p role="alert" className="ma-note">
              <PortalIcon name="clock" size={18} strokeWidth={1.5} />
              {"You've used today's 20 checks. More at midnight."}
            </p>
          )}
          {error && (
            <p role="alert" className="ma-note ma-note-error">
              <PortalIcon name="circle-alert" size={18} strokeWidth={1.5} />
              {error}
            </p>
          )}
          <p className="text-muted-foreground mr-auto text-[13px]">
            Marked against the question’s marking criteria
          </p>
          <p className="sr-only" role="status">
            {remaining} of {MARK_MY_ANSWER_DAILY_LIMIT} checks left today
          </p>
          <Button
            type="submit"
            size="lg"
            className="home-primary"
            disabled={!valid || locked || filling}
          >
            {busy ? "Marking…" : error ? "Retry" : "Mark my answer"}
            <PortalIcon name="arrow-right" size={20} strokeWidth={1.5} />
          </Button>
        </div>
      </form>
      <Dialog
        open={/session expired|sign-in expired|unauthorised/i.test(error)}
        onOpenChange={(open) => {
          if (!open) setError("");
        }}
      >
        <DialogContent>
          <DialogTitle>Sign in to keep working</DialogTitle>
          <DialogDescription>
            Your draft is kept in this browser. Sign in, then return to finish
            your check.
          </DialogDescription>
          <a
            href={`/sign-in?next=${encodeURIComponent(initial ? `/student/activity/${initial.sessionId}` : "/student/mark")}`}
            className="text-sm font-semibold underline"
          >
            Sign in again
          </a>
        </DialogContent>
      </Dialog>
    </>
  );
}
