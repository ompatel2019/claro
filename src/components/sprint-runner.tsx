"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalIcon, Flag, Spinner } from "@/components/icons";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { cleanupAnswerPhotos } from "@/lib/answer-photo-cleanup";
import { ensureSession, withAuthRetry } from "@/lib/auth-client";
import {
  answered,
  plural,
  timeLimit,
  timer,
  type Attempt,
  type Session,
} from "@/lib/practice";
import { createSprintMarkQueue } from "@/lib/sprint-mark-queue";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Kbd } from "./claro/layout";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { MarkingScreen } from "./marking-screen";
import { RichText } from "./rich-text";
import { McqExplanationView } from "./mcq-explanation";
import type { McqExplanation } from "@/lib/mcq-explanation";
import { QuestionView } from "./question-view";
import { isTyping, type SaveState } from "./session-shell";
import { WrittenAnswer } from "./written-answer";
import { ScanToText } from "./scan-to-text";
import { AnnotatedFeedback } from "./annotated-feedback";
import { inlineSprintFeedback } from "@/lib/feedback";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { TYPE_LABEL } from "@/lib/results";

import { SprintFocusShell } from "./student/sprint/focus-shell";
import { questionPillState } from "./student/sprint/question-pill";
import { BookletFilter, BookletLegend } from "./booklet-controls";

const LETTERS = "ABCD";
const draftKey = (id: string) => `claro-draft-${id}`;

export function SprintRunner({
  session,
  initial,
  initialExplanations = {},
  userId,
  title,
  seen = [],
}: {
  session: Session;
  initial: Attempt[];
  initialExplanations?: Record<string, string>;
  userId: string;
  title: string;
  seen?: string[];
}) {
  const router = useRouter();
  const [db] = useState(createClient);
  const [attempts, setAttempts] = useState(initial);
  const rows = useRef(initial);
  const photoPaths = useRef(
    new Map(initial.map((a) => [a.id, a.image_paths ?? []])),
  );
  const first = initial.findIndex((a) => !answered(a));
  const [index, setIndex] = useState(first < 0 ? 0 : first);
  const [elapsed, setElapsed] = useState(session.elapsed_s ?? 0);
  const seconds = useRef(session.elapsed_s ?? 0);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [readAll, setReadAll] = useState(false);
  const [answerModes, setAnswerModes] = useState<
    Record<string, "type" | "photo">
  >({});
  const [filter, setFilter] = useState<"all" | "unanswered" | "flagged">("all");
  const [finishing, setFinishing] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const dirty = useRef(new Map<string, Partial<Attempt>>());
  const limit = timeLimit(session.config);
  // §3.2 feedback "each": check as you go.
  const checkMode = session.config.feedback === "each";
  const [checking, setChecking] = useState<string | null>(null);
  const [explanations, setExplanations] =
    useState<Record<string, string | McqExplanation>>(initialExplanations);

  const [background] = useState(() =>
    createSprintMarkQueue(async (id) => {
      const post = () =>
        fetch(`/api/attempts/${id}/mark`, {
          method: "POST",
          credentials: "same-origin",
        });
      let response = await post();
      if (response.status === 401) {
        await ensureSession(db);
        response = await post();
      }
      if (!response.ok) throw new Error("Background marking failed");
    }),
  );
  const backgroundAnswer = (a: Attempt) =>
    !checkMode && a.question.type !== "mcq";
  function enqueueAnswer(a: Attempt) {
    if (backgroundAnswer(a) && answered(a))
      background.enqueue(
        a.id,
        JSON.stringify([a.answer_text, a.transcript, a.image_paths]),
      );
  }

  function local(id: string, patch: Partial<Attempt>) {
    rows.current = rows.current.map((a) => {
      if (a.id !== id) return a;
      const changed =
        backgroundAnswer(a) &&
        (["answer_text", "transcript", "image_paths"] as const).some(
          (key) =>
            key in patch &&
            JSON.stringify(patch[key]) !== JSON.stringify(a[key]),
        );
      return {
        ...a,
        ...patch,
        ...(changed
          ? {
              status: "pending",
              mark: null,
              max_marks: null,
              band: null,
              feedback: null,
            }
          : {}),
      };
    });
    setAttempts(rows.current);
  }
  function save(id: string, patch: Partial<Attempt>) {
    setSaveState("saving");
    const operation = queue.current.then(() =>
      withAuthRetry(db, async () => {
        if (patch.image_paths) {
          photoPaths.current.set(id, [
            ...new Set([
              ...(photoPaths.current.get(id) ?? []),
              ...patch.image_paths,
            ]),
          ]);
        }
        if (backgroundAnswer(rows.current.find((a) => a.id === id)!)) {
          const response = await fetch(`/api/attempts/${id}/mark`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (!response.ok)
            throw new Error(
              (await response.json()).error ?? "Could not save answer",
            );
          return;
        }
        const { error, data } = await db
          .from("attempts")
          .update(patch)
          .eq("id", id)
          .eq("user_id", userId)
          .in("status", ["pending", "transcribed"])
          .select("id");
        if (error || !data?.length)
          throw new Error(
            error?.message ??
              "This answer is no longer editable. Refresh to see its status.",
          );
      }),
    );
    const cleaned = operation.then(async () => {
      if ("image_paths" in patch) {
        const paths = patch.image_paths ?? [];
        const removed = (photoPaths.current.get(id) ?? []).filter(
          (path) => !paths.includes(path),
        );
        await cleanupAnswerPhotos(userId, removed);
        photoPaths.current.set(id, paths);
      }
    });
    queue.current = cleaned.catch(() => {});
    return cleaned.then(
      () => {
        if (!dirty.current.has(id)) localStorage.removeItem(draftKey(id));
        if (!dirty.current.size) setSaveState("saved");
      },
      (e) => {
        setSaveState("error");
        throw e;
      },
    );
  }
  async function flush() {
    for (const [id, patch] of dirty.current) {
      dirty.current.delete(id);
      try {
        await save(id, patch);
      } catch (error) {
        dirty.current.set(id, { ...patch, ...dirty.current.get(id) });
        throw error;
      }
    }
    await queue.current;
    await cleanupAnswerPhotos(userId);
  }
  async function persistTime() {
    await withAuthRetry(db, async () => {
      const { error } = await db
        .from("sessions")
        .update({ elapsed_s: seconds.current })
        .eq("id", session.id)
        .eq("user_id", userId)
        .is("finished_at", null);
      if (error) throw new Error(error.message);
    });
  }
  function edit(id: string, patch: Partial<Attempt>) {
    local(id, patch);
    const next = { ...dirty.current.get(id), ...patch };
    dirty.current.set(id, next);
    // Mirror unsaved text locally until the server confirms it.
    localStorage.setItem(draftKey(id), JSON.stringify(next));
    setSaveState("saving");
  }
  useEffect(() => {
    // Restore drafts the server never confirmed (closed tab, lost connection).
    for (const a of rows.current) {
      const draft = localStorage.getItem(draftKey(a.id));
      if (!draft) continue;
      if (
        backgroundAnswer(a) ||
        ["pending", "transcribed"].includes(a.status)
      ) {
        const patch: Partial<Attempt> = JSON.parse(draft);
        photoPaths.current.set(a.id, [
          ...new Set([...(a.image_paths ?? []), ...(patch.image_paths ?? [])]),
        ]);
        edit(a.id, patch);
      } else localStorage.removeItem(draftKey(a.id));
    }
    if (initial.some(answered))
      toast(
        limit
          ? `Welcome back. ${timer(Math.max(0, limit - (session.elapsed_s ?? 0)))} left`
          : "Welcome back.",
      );
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/purity -- This baseline is captured in the mount effect, after render.
    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      seconds.current += Math.floor((now - last) / 1000);
      last += Math.floor((now - last) / 1000) * 1000;
      setElapsed(seconds.current);
    }, 1000);
    const save = () =>
      void withAuthRetry(db, async () => {
        const { error } = await db
          .from("sessions")
          .update({ elapsed_s: seconds.current })
          .eq("id", session.id)
          .eq("user_id", userId)
          .is("finished_at", null);
        if (error) throw new Error(error.message);
      }).catch((e: Error) =>
        setError(
          e.message.includes("sign-in expired")
            ? e.message
            : "Could not save your timer. Check your connection.",
        ),
      );
    const persist = setInterval(save, 15000);
    const hide = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", hide);
    // Keep the access token fresh while the tab stays open.
    const refresh = setInterval(
      () => void ensureSession(db).catch(() => {}),
      4 * 60_000,
    );
    return () => {
      clearInterval(tick);
      clearInterval(persist);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [db, session.id, userId]);
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => {
    // Clock ticks must not restart the five-second retry delay.
    const timeout = setTimeout(
      () => void flushRef.current().catch((e) => setError(e.message)),
      saveState === "error" ? 5000 : 650,
    );
    return () => clearTimeout(timeout);
  }, [saveState, attempts]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setFinishing(false);
      background.resume();
      window.scrollTo({ top: 0, behavior: "smooth" });
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function change(next: number) {
    if (next < 0 || next >= rows.current.length) return;
    // Persist the current draft before swapping questions so keystrokes
    // during the transition cannot land on the next question.
    await flush();
    await persistTime();
    if (next !== index) enqueueAnswer(rows.current[index]);
    setIndex(next);
  }
  async function finish() {
    setConfirm(false);
    setFinishing(true);
    setError("");
    setFinishFailed(false);
    try {
      await ensureSession(db);
      await flush();
      await persistTime();
      await background.finish();
      async function post() {
        const response = await fetch(`/api/sessions/${session.id}/finish`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
        });
        const result = await response.json().catch(() => ({}));
        return { response, result };
      }
      let { response, result } = await post();
      if (response.status === 401) {
        await ensureSession(db);
        ({ response, result } = await post());
      }
      if (!response.ok)
        throw new Error(
          result.error ?? "Could not finish your session. Please try again.",
        );
      // Hard navigation so no cached "unfinished" redirect can bounce us back.
      window.location.assign(`/student/sprint/${session.id}/results`);
    } catch (error) {
      try {
        const { data } = await db
          .from("sessions")
          .select("finished_at")
          .eq("id", session.id)
          .maybeSingle();
        if (data?.finished_at) {
          window.location.assign(`/student/sprint/${session.id}/results`);
          return;
        }
      } catch {}
      setFinishFailed(true);
      throw error;
    }
  }
  const a = attempts[index];
  const editable =
    !!a &&
    (backgroundAnswer(a) || ["pending", "transcribed"].includes(a.status)) &&
    checking !== a.id;
  const answerKey =
    checkMode && a?.status === "marked" ? a.feedback?.correct_index : null;
  const needsCheck = checkMode && editable && answered(a);
  async function check() {
    if (!checkMode || checking || busy || !editable || !answered(a)) return;
    const id = a.id;
    setChecking(id);
    setError("");
    try {
      await flush();
      const post = () =>
        fetch(`/api/attempts/${id}/mark`, {
          method: "POST",
          credentials: "same-origin",
        });
      let res = await post();
      if (res.status === 401) {
        await ensureSession(db);
        res = await post();
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          body.error ?? "Could not check this answer. Try again.",
        );
      local(id, {
        status: body.status ?? "marked",
        mark: body.mark,
        max_marks: body.max_marks,
        band: body.band,
        feedback: body.feedback,
        sample_answer: body.sample_answer ?? null,
      });
      if (body.explanation)
        setExplanations((e) => ({
          ...e,
          [id]: body.structured_explanation ?? body.explanation,
        }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(null);
    }
  }
  const checkRef = useRef(check);
  useEffect(() => {
    checkRef.current = check;
  });
  useEffect(() => {
    if (!checkMode) return;
    // ⌘Enter checks the current answer, even from the answer box.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void checkRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checkMode]);
  // Expiry never submits an answer, including sessions saved with the old finish option.
  const timedOut = useRef(false);
  useEffect(() => {
    if (!limit || elapsed < limit || timedOut.current) return;
    timedOut.current = true;
    const sound = new Audio("/sounds/time-up.wav");
    void sound.play().catch(() => {});
    return () => sound.pause();
  }, [elapsed, limit]);
  function choose(i: number | null) {
    const previous = a.choice_index;
    local(a.id, { choice_index: i });
    save(a.id, { choice_index: i }).catch((e: Error) => {
      local(a.id, { choice_index: previous });
      setError(e.message);
    });
  }
  function flag() {
    const previous = a.flagged;
    local(a.id, { flagged: !previous });
    save(a.id, { flagged: !previous }).catch((e: Error) => {
      local(a.id, { flagged: previous });
      setError(e.message);
    });
  }
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (!a || busy || !editable) return;
      const k = e.key.toUpperCase();
      if (k === "F") flag();
      else if (a.question.type === "mcq" && /^[1-4A-D]$/.test(k)) {
        const i = /\d/.test(k) ? Number(k) - 1 : LETTERS.indexOf(k);
        if (i < (a.question.options?.length ?? 0)) choose(i);
      } else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      !(e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) &&
      keys.current(e);
    // Capture phase, so an MC letter (B, C) picks the option before the
    // shell treats it as Booklet or Calculator.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const unanswered = attempts.flatMap((r, i) => (answered(r) ? [] : [i]));
  const flagged = attempts.flatMap((r, i) => (r.flagged ? [i] : []));
  if (!a)
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        <h1>No questions in this sprint</h1>
        <Button onClick={() => router.push("/student")}>
          Return to dashboard
        </Button>
      </main>
    );
  if (finishing) return <MarkingScreen />;
  const go = (i: number) => void act(() => change(i));
  const qLabel = (i: number) => `Q${i + 1}`;
  const sprintBooklet = (
    <div className="flex min-h-[calc(100svh-9rem)] flex-1 flex-col gap-5 md:min-h-0">
      <p className="text-muted-foreground absolute top-6 right-5 text-xs">
        {attempts.filter(answered).length} of {attempts.length} answered
      </p>
      <BookletFilter filter={filter} onFilter={setFilter} />
      <nav aria-label="Question booklet" className="space-y-5">
        {(["mcq", "short", "extended"] as const).map((type) => {
          const items = attempts
            .map((row, i) => ({ row, i }))
            .filter(({ row }) => row.question.type === type)
            .filter(({ row }) =>
              filter === "unanswered"
                ? !answered(row)
                : filter === "flagged"
                  ? row.flagged
                  : true,
            );
          return items.length ? (
            <div key={type}>
              <h3 className="text-muted-foreground mb-2.5 text-xs font-medium">
                {TYPE_LABEL[type]}
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {items.map(({ row, i }) => {
                  const pill = questionPillState({
                    active: index === i,
                    answered: answered(row),
                    flagged: row.flagged,
                  });
                  return (
                    <button
                      key={row.id}
                      type="button"
                      data-q
                      disabled={busy}
                      aria-current={pill["aria-current"]}
                      aria-label={`Question ${i + 1}, ${pill.label}${row.status === "marked" ? `, ${row.mark}/${row.max_marks} marks` : ""}`}
                      onClick={() => go(i)}
                      className={cn(
                        "focus-visible:outline-ring size-9 text-sm font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2",
                        pill.className,
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null;
        })}
      </nav>
      <BookletLegend />
      <Button
        variant="outline"
        size="sm"
        className="mt-auto w-full"
        onClick={() => setReadAll(true)}
      >
        <PortalIcon name="list" className="size-4" /> Read all questions
      </Button>
    </div>
  );

  const exit = () =>
    void act(async () => {
      await flush();
      await persistTime();
      router.push("/student");
    });

  const answerMode =
    answerModes[a.id] ?? (a.image_paths?.length ? "photo" : "type");
  const setAnswerMode = (mode: "type" | "photo") =>
    setAnswerModes((current) => ({ ...current, [a.id]: mode }));

  return (
    <>
      <SprintFocusShell
        title={title}
        wide={checkMode && a.question.type !== "mcq" && a.status === "marked"}
        position={index + 1}
        total={attempts.length}
        answered={attempts.length - unanswered.length}
        saveState={saveState}
        onRetry={() => void flush().catch((e) => setError(e.message))}
        clock={
          limit
            ? { mode: "down", seconds: limit - elapsed }
            : { mode: "up", seconds: elapsed }
        }
        busy={busy}
        onExit={exit}
        onFinish={() => setConfirm(true)}
        onMove={(d) => !busy && go(index + d)}
        booklet={sprintBooklet}
        progress={attempts.map((row, i) => {
          const pill = questionPillState({
            active: i === index,
            answered: answered(row),
            flagged: row.flagged,
          });
          return (
            <button
              key={row.id}
              type="button"
              aria-label={`Question ${i + 1}, ${pill.label}`}
              aria-current={pill["aria-current"]}
              disabled={busy}
              onClick={() => go(i)}
              className="focus-visible:outline-ring flex h-8 min-w-8 flex-1 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span aria-hidden className={cn("h-3 w-full", pill.className)} />
            </button>
          );
        })}
      >
        {!!limit && elapsed >= limit && (
          <div role="alert" className="bg-accent rounded-xl border p-4 text-sm">
            Time’s up. You can keep working in overtime or choose Finish and
            mark.
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="border-destructive bg-destructive-soft text-destructive flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
          >
            <p>{error}</p>
            {finishFailed && (
              <a
                href={`/student/sprint/${session.id}/results`}
                className="underline"
              >
                View results
              </a>
            )}
            {error.includes("sign-in expired") && (
              <a
                className="button-link"
                href={`/sign-in?next=/student/sprint/${session.id}`}
              >
                Sign in again
              </a>
            )}
          </div>
        )}
        <article className="space-y-6 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">Question {index + 1}</Badge>
              <Badge variant="secondary">{TYPE_LABEL[a.question.type]}</Badge>
              <Badge variant="secondary">
                {plural(a.question.marks, "mark")}
              </Badge>
              {(a.question.year || a.question.source) && (
                <span>
                  {a.question.year &&
                    !a.question.source.includes(String(a.question.year)) &&
                    `${a.question.year} `}
                  {a.question.source}
                </span>
              )}
              {seen.includes(a.question_id) && (
                <Badge variant="outline" className="ml-2 align-middle">
                  Seen before
                </Badge>
              )}
            </p>
          </div>
          <QuestionView question={a.question} showMetadata={false} />
          {a.question.type === "mcq" ? (
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Choose your answer</legend>
              {a.question.options?.map((option, i) => (
                <label
                  key={i}
                  className={cn(
                    "has-[:focus-visible]:ring-ring bg-card border-input has-[:focus-visible]:outline-ring flex cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-4 text-base leading-6 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                    a.choice_index === i
                      ? "border-primary bg-accent"
                      : "hover:bg-muted",
                    answerKey === i && "border-success bg-success-soft",
                    answerKey != null &&
                      answerKey !== i &&
                      a.choice_index === i &&
                      "border-destructive bg-destructive-soft",
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`choice-${a.id}`}
                    aria-label={`Option ${LETTERS[i]}: ${option}`}
                    checked={a.choice_index === i}
                    disabled={busy || !editable}
                    onChange={() => choose(i)}
                    onClick={() => a.choice_index === i && choose(null)}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "text-muted-foreground border-input flex size-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold",
                      a.choice_index === i &&
                        "bg-primary border-primary text-primary-foreground",
                    )}
                  >
                    {LETTERS[i]}
                  </span>
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
          ) : checkMode && a.status === "marked" ? null : (
            <div className="space-y-4">
              <div
                role="group"
                aria-label="Answer method"
                className="bg-card inline-flex gap-1 rounded-full border p-1"
              >
                {(["type", "photo"] as const).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={answerMode === mode ? "default" : "ghost"}
                    aria-pressed={answerMode === mode}
                    disabled={busy || !editable}
                    onClick={() => setAnswerMode(mode)}
                  >
                    <PortalIcon
                      name={mode === "type" ? "pen-line" : "camera"}
                    />
                    {mode === "type" ? "Type" : "Photo"}
                  </Button>
                ))}
              </div>
              <WrittenAnswer
                mode={answerMode}
                onModeChange={setAnswerMode}
                disabled={busy || !editable}
                onBusy={setBusy}
                key={a.question_id ?? a.id}
                attempt={backgroundAnswer(a) ? { ...a, status: "pending" } : a}
                userId={userId}
                edit={(patch) => edit(a.id, patch)}
                save={async (patch) => {
                  edit(a.id, patch);
                  await flush();
                }}
                flush={flush}
                local={(patch) => local(a.id, patch)}
              />
            </div>
          )}
          {a.question.type !== "mcq" && editable && !a.image_paths?.length && (
            <ScanToText
              key={a.id}
              attemptId={a.id}
              value={a.answer_text ?? ""}
              disabled={busy}
              onBusy={setBusy}
              onText={(text) => edit(a.id, { answer_text: text })}
            />
          )}
          {backgroundAnswer(a) && (
            <Button
              disabled={busy || !answered(a)}
              onClick={() =>
                void act(async () => {
                  await flush();
                  enqueueAnswer(rows.current[index]);
                })
              }
            >
              Submit answer
            </Button>
          )}
          {checkMode && a.status === "marked" && (
            <CheckResult
              attempt={a}
              explanation={explanations[a.id]}
              checking={false}
              canCheck={false}
              onCheck={() => void check()}
            />
          )}
          <div
            role="group"
            aria-label="Answer actions"
            className="flex flex-wrap items-center gap-3 pt-2"
          >
            {checkMode && a.status !== "marked" && (
              <CheckResult
                attempt={a}
                explanation={explanations[a.id]}
                checking={checking === a.id}
                highlight={needsCheck}
                canCheck={editable && answered(a) && !busy && !checking}
                onCheck={() => void check()}
              />
            )}
            <p className="text-muted-foreground ml-auto hidden items-center gap-1.5 text-xs sm:flex">
              {a.question.type === "mcq" ? (
                <>
                  <Kbd>A</Kbd>–<Kbd>D</Kbd> to answer · <Kbd>←</Kbd>
                  <Kbd>→</Kbd> to move · <Kbd>F</Kbd> to flag
                </>
              ) : (
                <>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>↵</Kbd> next question
                </>
              )}
            </p>
          </div>
        </article>
        <div className="sprint-session-footer bg-background fixed right-0 bottom-0 left-[var(--sprint-rail)] z-20 border-t px-4 py-3">
          <div className="mx-auto flex max-w-[760px] items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="mr-auto"
              aria-label="Flag for review"
              aria-pressed={a.flagged}
              disabled={busy || !editable}
              onClick={flag}
            >
              <Flag className={cn(a.flagged && "text-brand-text")} />
              <span className="hidden sm:inline">Flag for review</span>
            </Button>

            <Button
              variant="outline"
              aria-label="Previous question"
              disabled={busy || index === 0}
              onClick={() => go(index - 1)}
            >
              <PortalIcon name="arrow-left" aria-hidden />
              <span className="sm:hidden">Previous</span>
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <span className="text-muted-foreground sr-only text-xs whitespace-nowrap tabular-nums">
              {index + 1} / {attempts.length}
            </span>
            {index < attempts.length - 1 ? (
              <Tooltip disabled={!needsCheck}>
                <TooltipTrigger
                  render={
                    <Button disabled={busy} onClick={() => go(index + 1)} />
                  }
                >
                  Next question <PortalIcon name="arrow-right" aria-hidden />
                </TooltipTrigger>
                <TooltipContent role="tooltip">
                  You’ve selected an answer, check it first?
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button disabled={busy} onClick={() => setConfirm(true)}>
                Finish and mark
              </Button>
            )}
          </div>
        </div>
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto">
            <DialogTitle>Finish and mark?</DialogTitle>
            <DialogDescription>
              {attempts.length - unanswered.length} of {attempts.length}{" "}
              answered. Unanswered questions score 0.
            </DialogDescription>
            {[
              ["Unanswered", unanswered],
              ["Flagged", flagged],
            ].map(([label, list]) =>
              (list as number[]).length ? (
                <p key={label as string} className="text-sm">
                  {label as string}:{" "}
                  {(list as number[]).map((i, n) => (
                    <span key={i}>
                      {n > 0 && ", "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => {
                          setConfirm(false);
                          go(i);
                        }}
                      >
                        {qLabel(i)}
                      </button>
                    </span>
                  ))}
                </p>
              ) : null,
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(false)}>
                Keep working
              </Button>
              <Button disabled={busy} onClick={() => void act(() => finish())}>
                Finish and mark
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={readAll} onOpenChange={setReadAll}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogTitle>All questions</DialogTitle>
            <ol className="space-y-4">
              {attempts.map((row, i) => (
                <li
                  key={row.id}
                  className="space-y-1 border-b border-dashed pb-4"
                >
                  <button
                    type="button"
                    className="text-sm font-semibold underline-offset-4 hover:underline"
                    onClick={() => {
                      setReadAll(false);
                      go(i);
                    }}
                  >
                    Question {i + 1} · {row.question.marks}{" "}
                    {row.question.marks === 1 ? "mark" : "marks"}
                  </button>
                  <RichText className="text-sm" text={row.question.stem} />
                </li>
              ))}
            </ol>
          </DialogContent>
        </Dialog>
      </SprintFocusShell>
    </>
  );
}

function CheckResult({
  attempt: a,
  explanation,
  checking,
  canCheck,
  highlight = false,
  onCheck,
}: {
  attempt: Attempt;
  explanation?: string | McqExplanation;
  checking: boolean;
  canCheck: boolean;
  highlight?: boolean;
  onCheck: () => void;
}) {
  if (a.status === "marked") {
    if (a.question.type === "mcq") {
      const right = Number(a.mark) >= 1;
      const k = a.feedback?.correct_index;
      return (
        <div
          role="status"
          className={cn(
            "space-y-2 rounded-xl p-4 text-sm",
            right ? "bg-success-soft" : "bg-destructive-soft",
          )}
        >
          <p className="font-semibold">
            {right
              ? "Correct"
              : `Incorrect · Answer: ${k == null ? "unknown" : LETTERS[k]}`}
          </p>
          {explanation && (
            <McqExplanationView explanation={explanation} correctIndex={k} />
          )}
        </div>
      );
    }
    return (
      <section aria-label="Checked answer feedback" className="space-y-3">
        {a.band && (
          <p className="text-muted-foreground text-sm">Band: {a.band}</p>
        )}
        <AnnotatedFeedback row={inlineSprintFeedback(a)} readOnly />
      </section>
    );
  }
  if (checking || a.status === "marking")
    return (
      <p role="status" className="flex items-center gap-2 text-sm">
        <Spinner className="size-4 animate-spin" /> Marking…
      </p>
    );
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        disabled={!canCheck}
        onClick={onCheck}
        className={cn(
          highlight && "bg-accent ring-primary ring-2 ring-offset-2",
        )}
        aria-description={
          highlight ? "You have an unchecked answer." : undefined
        }
      >
        Check answer
      </Button>
      <span className="text-muted-foreground text-xs">⌘Enter</span>
    </div>
  );
}
