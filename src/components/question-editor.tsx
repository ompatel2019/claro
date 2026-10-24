"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  readMcqExplanation,
  withoutCorrectOptionNote,
  type McqExplanation,
} from "@/lib/mcq-explanation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Close, Plus } from "@/components/icons";
import { saveQuestion } from "@/app/admin/content/questions/actions";
import type { loadQuestion } from "@/lib/admin-questions";
import type { ReviewRow } from "@/lib/feedback";
import {
  TYPED_ANSWER_WORD_LIMIT,
  TYPED_ANSWER_WARNING_WORDS,
} from "@/lib/limits";
import type { Topic } from "@/lib/practice";
import {
  marksRange,
  ORIGIN_LABELS,
  publishProblems,
  questionSchema,
  TYPE_LABELS,
  validateCriteria,
  VERBS,
  type Criterion,
  type QuestionInput,
} from "@/lib/question-bank";
import { createClient } from "@/utils/supabase/client";
import { FormField as Field } from "./form-field";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { AnnotatedFeedback } from "./annotated-feedback";
import { QuestionKey, QuestionView } from "./question-view";
import { Button, buttonVariants } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { FilePicker } from "./ui/file-picker";
import { TopicSelect } from "./topic-select";
import { FormSelect } from "./ui/form-select";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

type Loaded = NonNullable<Awaited<ReturnType<typeof loadQuestion>>>;
const LETTERS = ["A", "B", "C", "D"];

const time = (iso: string) =>
  new Date(iso)
    .toLocaleTimeString("en-AU", {
      timeZone: "Australia/Sydney",
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(/\s?([ap])m$/i, " $1m");

/** §4.4 editor: the form | Preview · Test mark · Stats. ⌘S saves; leaving with changes asks first. */
export function QuestionEditor({
  loaded,
  topics,
}: {
  loaded: Loaded;
  topics: Topic[];
}) {
  const router = useRouter();
  // Stored rows may predate the rules (long stems, unknown verbs): edit them as they are.
  const [form, setForm] = useState<QuestionInput>({
    ...loaded.question,
    verb: VERBS.includes(loaded.question.verb as (typeof VERBS)[number])
      ? loaded.question.verb
      : null,
  });
  const [mcExplanation, setMcExplanation] = useState<McqExplanation | null>(
    readMcqExplanation(loaded.question.explanation, true),
  );
  const [savedAt, setSavedAt] = useState(loaded.question.updated_at);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [criteriaTouched, setCriteriaTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [leave, setLeave] = useState<string | "back" | null>(null);
  const discard = useRef(false);
  const guardEntry = useRef(false);
  const saveQueued = useRef(false);
  const [uploading, setUploading] = useState(false);
  const locked = loaded.attemptCount > 0;
  const mc = form.type === "mcq";
  const [lo, hi] = marksRange(form.type);
  const bands = validateCriteria(form.criteria ?? [], form.marks);

  const set = <K extends keyof QuestionInput>(
    key: K,
    value: QuestionInput[K],
  ) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };
  const setType = (type: QuestionInput["type"]) => {
    const [, max] = marksRange(type);
    setForm((f) => ({
      ...f,
      type,
      marks:
        type === "mcq" ? 1 : type === "extended" ? max : Math.min(f.marks, max),
      options: type === "mcq" ? (f.options ?? ["", "", "", ""]) : f.options,
    }));
    setDirty(true);
  };
  const setExplanation = (
    explanation: McqExplanation,
    correctIndex = form.correct_index,
  ) => {
    const next = withoutCorrectOptionNote(explanation, correctIndex);
    setMcExplanation(next);
    set("explanation", JSON.stringify(next));
  };
  const setCriteria = (criteria: Criterion[]) => {
    setCriteriaTouched(true);
    set("criteria", criteria);
  };
  const showBands = saveAttempted || criteriaTouched;

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty && !discard.current) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (
        !dirty ||
        discard.current ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.href === location.href ||
        link.getAttribute("href")?.startsWith("#")
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      setLeave(link.href);
    };
    // A same-URL entry keeps the editor mounted when Back opens the guard.
    if (dirty && !guardEntry.current) {
      history.pushState(history.state, "", location.href);
      guardEntry.current = true;
    }
    const back = () => {
      if (!guardEntry.current) return;
      if (dirty && !discard.current) {
        history.pushState(history.state, "", location.href);
        setLeave("back");
      } else {
        guardEntry.current = false;
        history.back();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", back);
    };
  }, [dirty]);

  async function insertImage(file: File) {
    setUploading(true);
    const data = new FormData();
    data.set("image", file);
    try {
      const response = await fetch("/api/admin/question-images", {
        method: "POST",
        body: data,
      });
      const result = await response.json();
      if (!response.ok || "error" in result) {
        setSummary([result.error ?? "Couldn’t upload this image."]);
        return;
      }
      const image = `![Stimulus image](${result.url})`;
      setForm((current) => ({
        ...current,
        stimulus: [current.stimulus, image].filter(Boolean).join("\n\n"),
      }));
      setDirty(true);
    } catch {
      setSummary(["Couldn't upload this image. Try again."]);
    } finally {
      setUploading(false);
    }
  }

  function save() {
    if (pending || uploading) return;
    setSaveAttempted(true);
    if (!navigator.onLine) {
      saveQueued.current = true;
      setSummary(["You're offline. We'll save when you're back."]);
      return;
    }
    const parsed = questionSchema.safeParse({
      ...form,
      explanation:
        mc && mcExplanation
          ? JSON.stringify(
              withoutCorrectOptionNote(mcExplanation, form.correct_index),
            )
          : form.explanation,
    });
    const next: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= issue.message;
    const problems =
      parsed.success && form.status === "live"
        ? publishProblems(parsed.data)
        : [];
    setErrors(next);
    setSummary([...Object.values(next), ...problems]);
    if (problems.length) {
      if (mc) {
        if (!form.explanation?.trim()) next.explanation = "Add an explanation.";
        else if (
          mcExplanation &&
          problems.some((p) => p.startsWith("Add the concept"))
        )
          next.explanation =
            "Add the concept, correct-answer reasoning and all other option explanations.";
        if (form.options?.some((o) => !o.trim()))
          next.options = "All four options are required.";
        if (form.correct_index == null)
          next.correct_index = "Pick the correct answer.";
      } else {
        if (!form.sample_answer?.trim())
          next.sample_answer = "Add a sample answer.";
        const bad = bands.rows.find(Boolean) || bands.summary;
        if (bad) next.criteria = bad;
      }
      setErrors(next);
    }
    if (!parsed.success || problems.length) return;
    start(async () => {
      const r = await saveQuestion(parsed.data, savedAt).catch(() => ({
        error: "Couldn’t save. Try again.",
      }));
      if ("conflict" in r) return setConflict(r.conflict);
      if ("error" in r) {
        setSummary([r.error]);
        return;
      }
      setSavedAt(r.updated_at);
      setDirty(false);
      setConflict(null);
      toast.success("Saved");
      router.refresh();
    });
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    const online = () => {
      if (saveQueued.current) {
        saveQueued.current = false;
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("online", online);
    };
  });

  const [parent, setParent] = useState(
    topics.find((t) => t.id === loaded.question.topic_id)?.parent_id ?? "",
  );

  return (
    <form
      noValidate
      className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <fieldset disabled={pending || uploading} className="min-w-0 space-y-4">
        {loaded.duplicate && (
          <p
            role="status"
            className="bg-card rounded-xl border px-4 py-3 text-sm"
          >
            Duplicate of{" "}
            <Link
              className="underline"
              href={`/admin/content/questions/${loaded.duplicate.id}`}
            >
              {loaded.duplicate.id}
            </Link>{" "}
            ({loaded.duplicate.status}).
          </p>
        )}
        {locked && (
          <p
            role="status"
            className="bg-card rounded-xl border px-4 py-3 text-sm"
          >
            Has {loaded.attemptCount} attempts. Type and marks are locked.
          </p>
        )}
        {conflict && (
          <div
            role="alert"
            className="bg-destructive-soft text-destructive flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm"
          >
            Changed by another admin at {time(conflict)}. Reload?
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => router.refresh()}
            >
              Reload
            </Button>
          </div>
        )}
        {summary.length > 0 && (
          <ul
            role="alert"
            className="bg-destructive-soft text-destructive list-disc rounded-xl py-3 pr-4 pl-8 text-sm"
          >
            {summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Question details</CardTitle>
            <CardDescription>
              Classification, marks and source metadata.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="ID"
              hint="Letters, digits and dashes. Fixed after saving."
              error={errors.id}
            >
              <Input value={form.id} readOnly pattern="[a-z0-9-]{3,40}" />
            </Field>
            <Field label="Type" error={errors.type}>
              <FormSelect
                value={form.type}
                disabled={locked || pending || uploading}
                onValueChange={(value) =>
                  setType(value as QuestionInput["type"])
                }
                options={[
                  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
              />
            </Field>
            <TopicSelect
              topics={topics}
              parent={parent}
              value={form.topic_id}
              disabled={pending || uploading}
              error={errors.topic_id}
              onParentChange={(id) => {
                setParent(id);
                set("topic_id", "");
              }}
              onChange={(id) => set("topic_id", id)}
            />
            <Field
              label="Marks"
              hint={mc ? "Multiple choice is always 1 mark." : `${lo}–${hi}`}
              error={errors.marks}
            >
              <Input
                type="number"
                min={lo}
                max={hi}
                value={form.marks}
                disabled={mc || locked}
                onChange={(e) => set("marks", Number(e.target.value))}
              />
            </Field>
            <Field label="Directive verb" error={errors.verb}>
              <FormSelect
                value={form.verb ?? ""}
                disabled={pending || uploading}
                onValueChange={(value) =>
                  set("verb", (value || null) as QuestionInput["verb"])
                }
                options={[
                  { value: "", label: "None" },
                  ...VERBS.map((value) => ({ value, label: value })),
                ]}
              />
            </Field>
            <Field
              label="Source label"
              hint="e.g. 2024 HSC Q21(b)"
              error={errors.source}
            >
              <Input
                maxLength={60}
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
              />
            </Field>
            <Field label="Year" error={errors.year}>
              <Input
                type="number"
                min={2000}
                max={new Date().getFullYear()}
                value={form.year}
                onChange={(e) => set("year", Number(e.target.value))}
              />
            </Field>
            <Field label="Origin">
              <Input
                readOnly
                value={
                  ORIGIN_LABELS[
                    loaded.question.origin as keyof typeof ORIGIN_LABELS
                  ]
                }
              />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Question content</CardTitle>
            <CardDescription>
              Student-facing stem, stimulus and optional image.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field
              label="Stem"
              hint="Markdown; tables render. Up to 4,000 characters."
              error={errors.stem}
            >
              <Textarea
                rows={5}
                maxLength={4000}
                value={form.stem}
                onChange={(e) => set("stem", e.target.value)}
              />
            </Field>
            <Field
              label="Stimulus"
              hint="Optional. Markdown tables and image links. Up to 8,000 characters."
              error={errors.stimulus}
            >
              <Textarea
                rows={4}
                maxLength={8000}
                value={form.stimulus ?? ""}
                onChange={(e) => set("stimulus", e.target.value || null)}
              />
            </Field>
            <div className="grid gap-1.5">
              <FilePicker
                label="Insert image"
                aria-describedby="question-image-hint"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void insertImage(file);
                }}
              />
              <p
                id="question-image-hint"
                className="text-muted-foreground text-[13px]"
              >
                JPEG, PNG or WebP, up to 10 MB.
              </p>
            </div>
          </CardContent>
        </Card>
        {mc ? (
          <Card>
            <CardHeader>
              <CardTitle>Options</CardTitle>
              <CardDescription>
                Pick the key and explain why each alternative is right or wrong.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <RadioGroup
                aria-label="Correct answer"
                value={
                  form.correct_index == null ? "" : String(form.correct_index)
                }
                onValueChange={(v) => {
                  const correctIndex = v === "" ? null : Number(v);
                  set("correct_index", correctIndex);
                  if (mcExplanation)
                    setExplanation(mcExplanation, correctIndex);
                }}
              >
                {LETTERS.map((letter, i) => (
                  <div key={letter} className="flex items-center gap-3">
                    <RadioGroupItem
                      value={String(i)}
                      aria-label={`${letter} is correct`}
                    />
                    <span className="w-4 font-semibold">{letter}</span>
                    <Input
                      aria-label={`Option ${letter}`}
                      maxLength={500}
                      value={form.options?.[i] ?? ""}
                      onChange={(e) => {
                        const options = [...(form.options ?? ["", "", "", ""])];
                        options[i] = e.target.value;
                        set("options", options);
                      }}
                    />
                  </div>
                ))}
              </RadioGroup>
              {errors.options && (
                <p role="alert" className="text-destructive text-xs">
                  {errors.options}
                </p>
              )}
              {errors.correct_index && (
                <p role="alert" className="text-destructive text-xs">
                  {errors.correct_index}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                Pick exactly one correct answer.
              </p>
              {mcExplanation ? (
                <div className="space-y-4">
                  <p className="text-sm font-semibold">Explanation</p>
                  {[
                    {
                      key: "concept" as const,
                      label: "Concept",
                      hint: "Define the idea before discussing the options.",
                    },
                    {
                      key: "why_correct" as const,
                      label: "Why the correct answer follows",
                      hint: "Explain how the concept leads to the correct option.",
                    },
                  ].map(({ key, label, hint }) => (
                    <Field key={key} label={label} hint={hint}>
                      <Textarea
                        rows={3}
                        value={mcExplanation[key]}
                        onChange={(e) => {
                          const next = {
                            ...mcExplanation,
                            [key]: e.target.value,
                          };
                          setExplanation(next);
                        }}
                      />
                    </Field>
                  ))}
                  {LETTERS.filter((_, i) => i !== form.correct_index).map(
                    (letter) => (
                      <Field
                        key={letter}
                        label={`Why option ${letter} is wrong`}
                      >
                        <Textarea
                          rows={2}
                          value={
                            mcExplanation.distractors[
                              letter as keyof McqExplanation["distractors"]
                            ] ?? ""
                          }
                          onChange={(e) => {
                            const next = {
                              ...mcExplanation,
                              distractors: {
                                ...mcExplanation.distractors,
                                [letter]: e.target.value,
                              },
                            };
                            setExplanation(next);
                          }}
                        />
                      </Field>
                    ),
                  )}
                  {errors.explanation && (
                    <p role="alert" className="text-destructive text-xs">
                      {errors.explanation}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Field
                    label="Explanation"
                    hint="Markdown. Required to publish."
                    error={errors.explanation}
                  >
                    <Textarea
                      rows={4}
                      value={form.explanation ?? ""}
                      onChange={(e) =>
                        set("explanation", e.target.value || null)
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const next = {
                        concept: "",
                        why_correct: form.explanation ?? "",
                        distractors: {},
                      };
                      setExplanation(next);
                    }}
                  >
                    Use concept-first explanation
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Marking</CardTitle>
              <CardDescription>
                Define complete mark bands and the guidance used by the marking
                engine.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Criteria bands</legend>
                <p className="text-muted-foreground text-xs">
                  Highest band first. Whole marks from 1 to {form.marks}; the
                  top band ends at {form.marks}.
                </p>
                {(form.criteria ?? []).map((c, i) => (
                  <div key={i} className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="number"
                        aria-label={`Band ${i + 1} min`}
                        aria-invalid={!!(showBands && bands.rows[i])}
                        aria-describedby={
                          showBands && bands.rows[i]
                            ? `band-${i}-error`
                            : undefined
                        }
                        className="w-20"
                        value={c.min}
                        onChange={(e) =>
                          setCriteria(
                            form.criteria!.map((x, j) =>
                              j === i
                                ? { ...x, min: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="number"
                        aria-label={`Band ${i + 1} max`}
                        aria-invalid={!!(showBands && bands.rows[i])}
                        aria-describedby={
                          showBands && bands.rows[i]
                            ? `band-${i}-error`
                            : undefined
                        }
                        className="w-20"
                        value={c.max}
                        onChange={(e) =>
                          setCriteria(
                            form.criteria!.map((x, j) =>
                              j === i
                                ? { ...x, max: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                      <Input
                        aria-label={`Band ${i + 1} descriptor`}
                        aria-invalid={!!(showBands && bands.rows[i])}
                        aria-describedby={
                          showBands && bands.rows[i]
                            ? `band-${i}-error`
                            : undefined
                        }
                        className="w-full min-w-0 sm:w-auto sm:min-w-40 sm:flex-1"
                        value={c.descriptor}
                        onChange={(e) =>
                          setCriteria(
                            form.criteria!.map((x, j) =>
                              j === i
                                ? { ...x, descriptor: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move band ${i + 1} up`}
                        disabled={i === 0}
                        onClick={() => {
                          const c2 = [...form.criteria!];
                          [c2[i - 1], c2[i]] = [c2[i], c2[i - 1]];
                          setCriteria(c2);
                        }}
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move band ${i + 1} down`}
                        disabled={i === form.criteria!.length - 1}
                        onClick={() => {
                          const c2 = [...form.criteria!];
                          [c2[i + 1], c2[i]] = [c2[i], c2[i + 1]];
                          setCriteria(c2);
                        }}
                      >
                        <ChevronDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove band ${i + 1}`}
                        onClick={() =>
                          setCriteria(form.criteria!.filter((_, j) => j !== i))
                        }
                      >
                        <Close />
                      </Button>
                    </div>
                    {showBands && bands.rows[i] && (
                      <p
                        id={`band-${i}-error`}
                        role="alert"
                        className="text-destructive text-xs"
                      >
                        {bands.rows[i]}
                      </p>
                    )}
                  </div>
                ))}
                {showBands && bands.summary && (
                  <p role="alert" className="text-destructive text-xs">
                    {bands.summary}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    const last = form.criteria?.at(-1);
                    const max = last ? Math.max(1, last.min - 1) : form.marks;
                    setCriteria([
                      ...(form.criteria ?? []),
                      { min: Math.max(1, max - 1), max, descriptor: "" },
                    ]);
                  }}
                >
                  <Plus /> Add band
                </Button>
              </fieldset>
              <Field
                label="Guideline notes"
                hint="Markdown: answers could include, must-mention terms, stats expectations."
                error={errors.guideline_notes}
              >
                <Textarea
                  rows={4}
                  value={form.guideline_notes ?? ""}
                  onChange={(e) =>
                    set("guideline_notes", e.target.value || null)
                  }
                />
              </Field>
              <Field
                label="Sample answer"
                hint="Markdown. Required to publish."
                error={errors.sample_answer}
              >
                <Textarea
                  rows={6}
                  value={form.sample_answer ?? ""}
                  onChange={(e) => set("sample_answer", e.target.value || null)}
                />
              </Field>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Publishing</CardTitle>
            <CardDescription>
              Live questions must pass every validation rule.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <Field
              label="Status"
              hint="Draft → Live → Retired. Publishing validates every rule."
              error={errors.status}
            >
              <FormSelect
                value={form.status}
                disabled={pending || uploading}
                onValueChange={(value) =>
                  set("status", value as QuestionInput["status"])
                }
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "live", label: "Live" },
                  { value: "retired", label: "Retired" },
                ]}
              />
            </Field>
            <Button type="submit" disabled={pending || uploading}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Link
              href="/admin/content/questions"
              className={buttonVariants({ variant: "ghost" })}
            >
              Back to questions
            </Link>
            <span className="text-muted-foreground text-xs">
              {dirty ? "Unsaved changes" : "Saved"} · ⌘S
            </span>
          </CardContent>
        </Card>
      </fieldset>
      <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Live summary</CardTitle>
            <CardDescription>
              Preview the student view, test the marker and inspect usage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="test">Test mark</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="space-y-6">
                <QuestionView
                  stem={form.stem}
                  stimulus={form.stimulus}
                  options={mc ? form.options : null}
                  marks={form.marks}
                  source={form.source}
                />
                <div className="border-t pt-4">
                  <p className="text-muted-foreground mb-3 text-xs font-medium">
                    After finishing, students also see
                  </p>
                  {mc && form.correct_index !== null && (
                    <p className="mb-2 font-medium">
                      Correct: {LETTERS[form.correct_index]}
                    </p>
                  )}
                  <QuestionKey
                    criteria={mc ? null : form.criteria}
                    sample={mc ? null : form.sample_answer}
                    explanation={mc ? form.explanation : null}
                    correctIndex={form.correct_index}
                  />
                </div>
              </TabsContent>
              <TabsContent value="test">
                {mc ? (
                  <p className="text-muted-foreground text-sm">
                    Multiple choice is marked by the key; nothing to test.
                  </p>
                ) : (
                  <TestMark form={form} recent={loaded.recentAnswers} />
                )}
              </TabsContent>
              <TabsContent value="stats">
                <Stats stats={loaded.stats} mc={mc} marks={form.marks} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={leave !== null}
        onOpenChange={(open) => !open && setLeave(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>
            Your unsaved changes will be lost.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                discard.current = true;
                if (leave === "back") {
                  guardEntry.current = false;
                  history.go(-2);
                } else if (leave) {
                  window.location.assign(leave);
                }
              }}
            >
              Leave without saving
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

type TestResult = {
  mark: number;
  band: string;
  check: { status: string; marks: number[] };
  feedback: Record<string, unknown>;
  model: string;
  effort: { grade: string; check: string; reconcile: string };
  cost: number;
};

/** Paste an answer or pick a recent real one; runs the live engine on the unsaved criteria. */
function TestMark({ form, recent }: { form: QuestionInput; recent: string[] }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<
    (TestResult & { question: QuestionInput; answer: string }) | null
  >(null);
  const ownAnswer = useRef(false);
  const restored = useRef(false);
  const adminId = useRef<string | null>(null);
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (session?.user) adminId.current = session.user.id;
      const key =
        adminId.current &&
        `admin-test-answer:${adminId.current}:${form.id || "new"}`;
      if (!key) return;
      try {
        if (!restored.current && session) {
          restored.current = true;
          const saved = localStorage.getItem(key);
          if (saved) {
            ownAnswer.current = true;
            setAnswer(saved);
            localStorage.removeItem(key);
          }
        }
        if (event === "SIGNED_OUT" && ownAnswer.current)
          localStorage.setItem(key, answer);
      } catch {
        /* Unsaved answers remain on the page when browser storage is unavailable. */
      }
    });
    return () => data.subscription.unsubscribe();
  }, [answer, form.id]);
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  async function run() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/test-mark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: {
            id: form.id || "test",
            type: form.type,
            marks: form.marks,
            stem: form.stem,
            stimulus: form.stimulus,
            criteria: form.criteria ?? [],
            guideline_notes: form.guideline_notes,
            sample_answer: form.sample_answer,
            source: form.source,
          },
          answer,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setResult({ ...body, question: form, answer });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const tested = result?.question ?? form;
  const row: ReviewRow | null = result && {
    attempt_id: "test",
    position: 1,
    question_id: tested.id || null,
    type: tested.type,
    marks: tested.marks,
    stem: tested.stem,
    stimulus: tested.stimulus,
    options: null,
    source: tested.source,
    topic_id: tested.topic_id || null,
    year: tested.year,
    choice_index: null,
    answer_text: result.answer,
    transcript: null,
    image_paths: null,
    flagged: false,
    status: "marked",
    check_status: result.check.status,
    mark: result.mark,
    max_marks: tested.marks,
    band: result.band,
    feedback: result.feedback,
    correct_index: null,
    criteria: tested.criteria,
    sample_answer: tested.sample_answer,
    explanation: null,
    review:
      result.check.status === "in_review"
        ? {
            status: "open",
            reason: "check_disagreed",
            final_mark: null,
          }
        : null,
  };
  return (
    <div className="space-y-3">
      {recent.length > 0 && (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Recent real answers (anonymised)</span>
          <FormSelect
            aria-label="Recent real answers (anonymised)"
            value=""
            onValueChange={(value) =>
              value &&
              ((ownAnswer.current = false), setAnswer(recent[Number(value)]))
            }
            options={[
              { value: "", label: "Pick one…" },
              ...recent.map((answer, i) => ({
                value: String(i),
                label: `${answer.slice(0, 80)}…`,
              })),
            ]}
          />
        </label>
      )}
      <Textarea
        aria-label="Answer to test"
        rows={6}
        placeholder="Paste an answer"
        value={answer}
        onChange={(e) => {
          ownAnswer.current = true;
          setAnswer(e.target.value);
        }}
      />
      <p className="text-muted-foreground text-xs" role="status">
        {words.toLocaleString()} words
        {words >= TYPED_ANSWER_WARNING_WORDS
          ? ` · limit ${TYPED_ANSWER_WORD_LIMIT.toLocaleString()}`
          : ""}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={busy || !answer.trim() || words > TYPED_ANSWER_WORD_LIMIT}
          onClick={run}
        >
          {busy ? "Marking…" : "Run test mark"}
        </Button>
        <span className="text-muted-foreground text-xs">
          Uses the unsaved criteria above.
        </span>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {row && result && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            {result.model} · grade {result.effort.grade}, check{" "}
            {result.effort.check}, reconcile {result.effort.reconcile} · check{" "}
            {result.check.status} ({result.check.marks.join(" / ")}) · $
            {result.cost.toFixed(4)}
          </p>
          <AnnotatedFeedback row={row} />
        </div>
      )}
    </div>
  );
}

function Stats({
  stats,
  mc,
  marks,
}: {
  stats: Loaded["stats"];
  mc: boolean;
  marks: number;
}) {
  const peak = Math.max(1, ...stats.histogram);
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-muted-foreground text-xs">Attempts</dt>
          <dd className="num-display text-xl font-semibold">
            {stats.attempts}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Average</dt>
          <dd className="num-display text-xl font-semibold">
            {stats.avg == null ? "No marks yet" : `${stats.avg}%`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Check disagreements</dt>
          <dd className="num-display text-xl font-semibold">
            {stats.disagreements}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Open reports</dt>
          <dd className="num-display text-xl font-semibold">
            {stats.reportCount}
          </dd>
        </div>
      </dl>
      {mc ? (
        <div>
          <p className="font-medium">Option pick rates</p>
          <p className="tabular-nums">
            {LETTERS.map((l, i) => `${l} ${stats.picks.rates[i]}%`).join(" · ")}
          </p>
          {stats.picks.flagged && (
            <p role="status" className="text-warning mt-1">
              Flagged: under 25% pick the key and one distractor dominates.
              Check the key.
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="font-medium">Mark distribution</p>
          <ul
            className="mt-2 flex items-end gap-1"
            aria-label="Mark distribution"
          >
            {stats.histogram.map((n, i) => (
              <li
                key={i}
                className="flex flex-1 flex-col items-center gap-1"
                aria-label={`${i} of ${marks}: ${n}`}
              >
                <span
                  className="bg-primary w-full rounded-t"
                  style={{ height: `${Math.max(2, (64 * n) / peak)}px` }}
                />
                <span className="text-muted-foreground text-xs tabular-nums">
                  {i}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {stats.reports.length > 0 && (
        <ul className="space-y-1">
          {stats.reports.map((r) => (
            <li key={r.id}>
              <Link
                className="line-clamp-1 underline"
                href={`/admin/feedback?id=${r.id}`}
              >
                {r.message}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
