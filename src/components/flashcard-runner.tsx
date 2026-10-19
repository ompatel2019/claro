"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ensureSession } from "@/lib/auth-client";
import {
  rateFlashcard,
  saveFlashcardTime,
} from "@/app/(app)/flashcards/actions";
import {
  nextQueue,
  resumeQueue,
  skipQueue,
  type Flashcard,
  type FlashcardMark,
  type FlashcardReview,
} from "@/lib/flashcards";
import {
  activeSessions,
  dropPersistSession,
  enqueuePersistRating,
  isMissingSessionError,
  removePersistRating,
  loadPersistQueue,
} from "@/lib/flashcard-persist-queue";
import type { FlashcardSession } from "@/lib/flashcard-data";
import { Button, ToggleGroup, ToggleGroupItem } from "./claro/controls";
import { Kbd } from "./claro/layout";
import { SessionShell, isTyping } from "./session-shell";
import {
  Microphone,
  Check,
  Minus,
  Close,
  PortalIcon,
} from "@/components/icons";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./ui/table";
import type { Topic } from "@/lib/practice";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const SHORTCUTS = [
  ["Space / Enter", "Flip"],
  ["1 / 2 / 3", "Rate"],
  ["⌘Enter", "Check"],
  ["M", "Microphone"],
  ["S", "Skip"],
  ["→", "Next after verdict"],
  ["L", "List view"],
  ["Esc", "Save and exit dialog"],
];
export function FlashcardRunner({
  session,
  cards,
  reviews,
  deckName,
  topics,
}: {
  session: FlashcardSession;
  cards: Flashcard[];
  reviews: FlashcardReview[];
  deckName: string;
  topics: Topic[];
}) {
  const router = useRouter();
  const [db] = useState(createClient);
  const [queue, setQueue] = useState(() =>
    resumeQueue(
      session.config.card_ids.filter((id) => cards.some((c) => c.id === id)),
      reviews,
      session.config.repeat_missed !== false,
    ),
  );
  const [welcome, setWelcome] = useState(reviews.length > 0);
  const [left] = useState(queue.length);
  const [announcement, setAnnouncement] = useState("");
  const [finished, setFinished] = useState(false);
  const [marks, setMarks] = useState(
    () => new Map(reviews.map((r) => [r.flashcard_id, r.mark])),
  );
  const attempts = useRef(
    new Map(
      session.config.card_ids.map((id) => [
        id,
        reviews.filter((r) => r.flashcard_id === id).length,
      ]),
    ),
  );
  const [flipped, setFlipped] = useState(false);
  const [draft] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`claro.flashcard.draft.${session.id}`) ?? "null",
      );
      if (
        saved?.cardId === queue[0] &&
        typeof saved.answer === "string" &&
        saved.answer.length <= 1000
      )
        return {
          answer: saved.answer as string,
          spoken: saved.spoken === true,
        };
    } catch {}
    return { answer: "", spoken: false };
  });
  const [answer, setAnswer] = useState(draft.answer);
  const [verdict, setVerdict] = useState<{
    mark: FlashcardMark;
    reason: string;
    reviewId: string;
  } | null>(null);
  const [list, setList] = useState(false);
  const [exit, setExit] = useState(false);
  const [disagree, setDisagree] = useState(false);
  const [failedCheck, setFailedCheck] = useState(false);
  const [spoken, setSpoken] = useState(draft.spoken);
  const [listening, setListening] = useState(false);
  const [speechNote, setSpeechNote] = useState("");
  const speech = useRef<Recognition | null>(null);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persists = useRef(new Set<Promise<void>>());
  const [seconds, setSeconds] = useState(session.elapsed_s ?? 0);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const lock = useRef(false);
  const started = useRef(0);
  useEffect(() => {
    started.current = Date.now();
    const tick = setInterval(
      () =>
        setSeconds(
          (session.elapsed_s ?? 0) +
            Math.floor((Date.now() - started.current) / 1000),
        ),
      1000,
    );
    const online = () => setOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      speech.current?.stop();
      if (silence.current) clearTimeout(silence.current);
    };
  }, [session.elapsed_s]);
  useEffect(() => {
    activeSessions.add(session.id);
    return () => {
      activeSessions.delete(session.id);
    };
  }, [session.id]);
  const heading = useRef<HTMLHeadingElement>(null);
  const card = cards.find((c) => c.id === queue[0]);
  const topic = topics.find((t) => t.id === card?.topic_id);
  const recycled = queue.filter(
    (id) => marks.has(id) && marks.get(id) !== 1,
  ).length;
  const done = session.config.card_ids.filter(
    (id) => marks.get(id) === 1,
  ).length;
  useEffect(() => {
    heading.current?.focus();
  }, [card?.id]);
  useEffect(() => {
    try {
      const key = `claro.flashcard.draft.${session.id}`;
      if (answer && !verdict)
        localStorage.setItem(
          key,
          JSON.stringify({ cardId: card?.id, answer, spoken }),
        );
      else localStorage.removeItem(key);
    } catch {}
  }, [answer, spoken, verdict, card?.id, session.id]);
  function act(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        if (!navigator.onLine || e instanceof TypeError) {
          setOffline(true);
          return;
        }
        setError(
          e instanceof Error
            ? e.message
            : "Could not save your review. Please try again.",
        );
      } finally {
        lock.current = false;
      }
    });
  }
  const saveTime = useCallback(async () => {
    await saveFlashcardTime(
      session.id,
      (session.elapsed_s ?? 0) +
        Math.floor((Date.now() - started.current) / 1000),
    );
  }, [session.id, session.elapsed_s]);
  useEffect(() => {
    const save = () =>
      void saveTime().catch((e: unknown) => {
        if (!navigator.onLine || e instanceof TypeError) {
          setOffline(true);
          return;
        }
        setError(
          e instanceof Error ? e.message : "Couldn't save the time. Try again.",
        );
      });
    const persist = setInterval(save, 15000);
    const hide = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", hide);
    const refresh = setInterval(
      () => void ensureSession(db).catch(() => {}),
      240000,
    );
    return () => {
      clearInterval(persist);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [saveTime, db]);
  async function post(url: string, body?: object) {
    await ensureSession(db);
    const send = () =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
      });
    let response = await send();
    if (response.status === 401) {
      await ensureSession(db);
      response = await send();
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? (result.error ?? "You're going a bit fast, try again in a minute")
          : (result.error ?? "Something went wrong. Please try again."),
      );
    return result;
  }
  async function retryRatings() {
    await Promise.all([...persists.current]);
    for (const item of loadPersistQueue().filter(
      (r) => r.sessionId === session.id,
    )) {
      await rateFlashcard(
        item.sessionId,
        item.cardId,
        item.mark,
        item.answer,
        item.answerMode,
      );
      removePersistRating(item.sessionId, item.cardId);
    }
  }
  async function finish() {
    if (finished) return;
    stopSpeech();
    await retryRatings();
    await saveTime();
    await post(`/api/sessions/${session.id}/finish`);
    setFinished(true);
    router.refresh();
  }
  async function advance(mark: FlashcardMark) {
    setWelcome(false);
    if (!card) return;
    const next = nextQueue(
      queue,
      card.id,
      mark,
      session.config.repeat_missed !== false,
      attempts.current.get(card.id) ?? 0,
    );
    attempts.current.set(card.id, (attempts.current.get(card.id) ?? 0) + 1);
    setMarks((prev) => new Map(prev).set(card.id, mark));
    setQueue(next);
    setFlipped(false);
    setAnswer("");
    setVerdict(null);
    setDisagree(false);
    setFailedCheck(false);
    stopSpeech();
    setSpoken(false);
    if (!next.length) await finish();
  }
  async function rate(mark: FlashcardMark) {
    setWelcome(false);
    setAnnouncement(
      mark === 1 ? "Knew it" : mark === 0.5 ? "Mostly" : "Missed it",
    );
    if (!card) return;
    const cardId = card.id;
    const sessionId = session.id;
    const prevQueue = queue;
    const prevMarks = marks;
    // Optimistic: advance immediately. Persist in the background (ratings are not AI).
    // Queue survives navigation; missing-session errors drop the queued session.
    // Network failures stay queued; other failures roll back for retry.
    const next = nextQueue(
      queue,
      cardId,
      mark,
      session.config.repeat_missed !== false,
      attempts.current.get(cardId) ?? 0,
    );
    const prevAttempts = attempts.current.get(cardId) ?? 0;
    attempts.current.set(cardId, prevAttempts + 1);
    setMarks((prev) => new Map(prev).set(cardId, mark));
    setQueue(next);
    setFlipped(false);
    setAnswer("");
    setVerdict(null);
    setDisagree(false);
    setFailedCheck(false);
    stopSpeech();
    setSpoken(false);
    const rating = {
      sessionId,
      cardId,
      mark,
      answer,
      answerMode: spoken ? ("spoken" as const) : ("typed" as const),
    };
    enqueuePersistRating(rating);
    const persist = async () => {
      await rateFlashcard(
        sessionId,
        cardId,
        mark,
        rating.answer,
        rating.answerMode,
      );
      removePersistRating(sessionId, cardId);
      await saveTime().catch(() => {});
    };
    const rollback = (e: unknown) => {
      if (!navigator.onLine || e instanceof TypeError) {
        setOffline(true);
        return;
      }
      if (isMissingSessionError(e)) dropPersistSession(sessionId);
      else enqueuePersistRating(rating);
      attempts.current.set(cardId, prevAttempts);
      setQueue(prevQueue);
      setMarks(prevMarks);
      setError(
        e instanceof Error
          ? e.message
          : "Could not save your rating. Please try again.",
      );
    };
    if (!next.length) {
      try {
        await persist();
      } catch (e) {
        rollback(e);
        if (!navigator.onLine || e instanceof TypeError) return;
        throw e;
      }
      await finish();
      return;
    }
    const pending = persist();
    persists.current.add(pending);
    void pending.then(
      () => persists.current.delete(pending),
      (e) => {
        persists.current.delete(pending);
        rollback(e);
      },
    );
  }
  async function check() {
    if (!card) return;
    stopSpeech();
    try {
      const result = await post(
        `/api/flashcards/${encodeURIComponent(card.id)}/mark`,
        {
          answer,
          sessionId: session.id,
          answer_mode: spoken ? "spoken" : "typed",
        },
      );
      setVerdict(result);
      setAnnouncement(
        result.mark === 1
          ? "Knew it"
          : result.mark === 0.5
            ? "Mostly"
            : "Not yet",
      );
      setMarks((prev) => new Map(prev).set(card.id, result.mark));
      await saveTime();
    } catch (e) {
      if (isMissingSessionError(e)) {
        dropPersistSession(session.id);
        throw e;
      }
      if (e instanceof Error && e.message.includes("sign-in expired")) throw e;
      setFailedCheck(true);
      throw new Error(
        e instanceof Error && /fast|limit|minute/i.test(e.message)
          ? e.message
          : "Couldn't check this one. Rate yourself instead.",
      );
    }
  }

  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (!queue.length) act(finish);
  });

  function stopSpeech() {
    speech.current?.stop();
    speech.current = null;
    if (silence.current) clearTimeout(silence.current);
    setListening(false);
  }
  function mic() {
    if (listening) {
      stopSpeech();
      return;
    }
    const browser = window as typeof window & {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Speech = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Speech) {
      setSpeechNote(
        "Speech isn't supported in this browser. You can type your answer.",
      );
      return;
    }
    const recognition = new Speech();
    speech.current = recognition;
    recognition.lang = "en-AU";
    recognition.continuous = true;
    recognition.interimResults = true;
    const base = answer;
    const resetSilence = () => {
      if (silence.current) clearTimeout(silence.current);
      silence.current = setTimeout(stopSpeech, 8000);
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results, (r) => r[0].transcript).join(
        " ",
      );
      if (transcript.trim()) setSpoken(true);
      setAnswer(`${base}${base ? " " : ""}${transcript}`.slice(0, 1000));
      resetSilence();
    };
    recognition.onerror = (e) => {
      if (
        ["not-allowed", "service-not-allowed", "audio-capture"].includes(
          e.error,
        )
      )
        setSpeechNote("Couldn't use the microphone. You can type your answer.");
      stopSpeech();
    };
    recognition.onend = () => {
      speech.current = null;
      setListening(false);
      if (silence.current) clearTimeout(silence.current);
    };
    try {
      recognition.start();
      setListening(true);
      setSpeechNote("");
      resetSilence();
    } catch {
      setSpeechNote("Couldn't use the microphone. You can type your answer.");
      stopSpeech();
    }
  }
  async function skip() {
    setWelcome(false);
    stopSpeech();
    const next = skipQueue(queue);
    setQueue(next);
    setFlipped(false);
    setAnswer("");
    setSpoken(false);
    setVerdict(null);
    setFailedCheck(false);
    if (!next.length) await finish();
  }
  async function override(mark: FlashcardMark) {
    if (!card || !verdict) return;
    const result = await post(
      `/api/flashcards/${encodeURIComponent(card.id)}/mark`,
      { sessionId: session.id, override: { reviewId: verdict.reviewId, mark } },
    );
    setVerdict(result);
    setAnnouncement(
      mark === 1 ? "Knew it" : mark === 0.5 ? "Mostly" : "Not yet",
    );
    setMarks((prev) => new Map(prev).set(card.id, mark));
    setDisagree(false);
  }
  const reconnect = useRef<() => void>(() => {});
  useEffect(() => {
    reconnect.current = () => {
      if (!offline || error) return;
      act(async () => {
        await retryRatings();
        if (!queue.length) await finish();
        setOffline(false);
      });
    };
  });
  useEffect(() => {
    const retry = () => reconnect.current();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (e.defaultPrevented || isTyping(e.target) || busy || exit) return;
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        answer.trim() &&
        session.config.mode === "test" &&
        !verdict &&
        !list
      ) {
        e.preventDefault();
        act(check);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "escape") setExit(true);
      else if (k === "l") {
        stopSpeech();
        setList((v) => !v);
      } else if (list) return;
      else if (k === "s" && !verdict) act(skip);
      else if (
        k === "m" &&
        session.config.answer_by !== "typing" &&
        !verdict &&
        !flipped
      )
        mic();
      else if (
        (k === " " || k === "enter") &&
        session.config.mode === "study"
      ) {
        if (
          e.target instanceof HTMLElement &&
          e.target.closest("button, a, input, [role=button]")
        )
          return;
        setFlipped((v) => !v);
      } else if (
        ["1", "2", "3"].includes(k) &&
        (flipped || failedCheck) &&
        !verdict
      )
        act(() =>
          rate(({ "1": 0, "2": 0.5, "3": 1 } as const)[k as "1" | "2" | "3"]),
        );
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const answerInput = (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (session.config.mode === "test") act(check);
      }}
    >
      <label className="grid gap-2 text-[13px] font-medium">
        Your answer
        <Textarea
          className="min-h-24 text-[15px] font-normal"
          placeholder="What does it mean? Use your own words"
          maxLength={1000}
          value={answer}
          disabled={busy}
          onKeyDown={(e) => {
            if (
              (e.metaKey || e.ctrlKey) &&
              e.key === "Enter" &&
              answer.trim()
            ) {
              e.preventDefault();
              if (session.config.mode === "test") act(check);
            }
          }}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {session.config.mode === "test" && (
          <Button type="submit" disabled={busy || !answer.trim()}>
            Check (⌘Enter)
          </Button>
        )}
        {session.config.answer_by !== "typing" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-keyshortcuts="m"
            aria-pressed={listening}
            disabled={busy}
            onClick={mic}
          >
            <Microphone />
            {listening ? "Stop" : "Speak"}
          </Button>
        )}
        {session.config.mode !== "test" && (
          <span className="text-muted-foreground text-xs">
            or type, then flip
          </span>
        )}
      </div>
    </form>
  );
  const ratingControls = (
    <div className="grid grid-cols-3 gap-2">
      {(
        [
          [0, disagree ? "Missed" : "Missed it (1)"],
          [0.5, disagree ? "Mostly" : "Mostly (2)"],
          [1, disagree ? "Knew it" : "Knew it (3)"],
        ] as const
      ).map(([mark, label]) => (
        <Button
          key={mark}
          autoFocus={mark === 0}
          className="h-14 rounded-xl px-1 text-xs sm:text-sm"
          variant="outline"
          disabled={busy}
          onClick={() => act(() => (disagree ? override(mark) : rate(mark)))}
        >
          {label}
        </Button>
      ))}
    </div>
  );
  const model = (
    <div className="bg-muted rounded-xl border p-4 whitespace-pre-wrap">
      <h3 className="mb-2 font-semibold">Model answer</h3>
      <p>{card?.back}</p>
    </div>
  );
  return (
    <SessionShell
      title={deckName}
      flashcards={{ known: done, shortcuts: SHORTCUTS }}
      position={
        card
          ? session.config.card_ids.indexOf(card.id) + 1
          : session.config.card_ids.length
      }
      total={session.config.card_ids.length}
      answered={marks.size}
      saveState={error ? "error" : busy ? "saving" : "saved"}
      onRetry={() =>
        act(async () => {
          await retryRatings();
          await saveTime();
          router.refresh();
        })
      }
      clock={{ mode: "up", seconds }}
      busy={busy}
      onExit={() =>
        act(async () => {
          stopSpeech();
          await saveTime();
          router.push("/student/flashcards");
        })
      }
      onFinish={() => act(finish)}
      onMove={(delta) => {
        if (delta === 1 && verdict && !list && !busy)
          act(() => advance(verdict.mark));
      }}
      booklet={null}
    >
      <div className="mx-auto grid max-w-[680px] gap-5">
        {offline && (
          <p role="status">{"You're offline. We'll save when you're back."}</p>
        )}
        {welcome && (
          <p role="status" className="sr-only">
            Welcome back, {left} {left === 1 ? "card" : "cards"} left
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <ToggleGroup
            aria-label="View"
            className="[&_[data-slot=toggle-group-item]]:min-h-7 [&_[data-slot=toggle-group-item]]:py-1"
            value={[list ? "list" : "one"]}
            onValueChange={(values) => {
              if (!values[0]) return;
              stopSpeech();
              setList(values[0] === "list");
            }}
          >
            <ToggleGroupItem value="one">One by one</ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List (L)">
              List
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex">
            <Kbd>L</Kbd> switch view
          </span>
        </div>
        {recycled > 0 && (
          <p className="sr-only">
            {recycled} {recycled === 1 ? "card" : "cards"} coming back
          </p>
        )}
        {list ? (
          <Card className="p-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead>Model answer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.config.card_ids.flatMap((id) => {
                  const c = cards.find((c) => c.id === id);
                  return c
                    ? [
                        <TableRow key={id} data-card-id={id}>
                          <TableCell>{c.front}</TableCell>
                          <TableCell className="whitespace-pre-wrap">
                            {c.back}
                          </TableCell>
                        </TableRow>,
                      ]
                    : [];
                })}
              </TableBody>
            </Table>
          </Card>
        ) : card ? (
          <article data-card-id={card.id}>
            <Card
              className={`min-h-[440px] px-6 py-6 sm:px-8 sm:py-7 ${flipped || verdict || failedCheck ? "gap-4" : "gap-0"}`}
            >
              <div className="mb-7">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {card.kind === "term" ? "Term" : "Key stat"}
                  </Badge>
                  {topic && <Badge variant="secondary">{topic.name}</Badge>}
                  <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                    {session.config.card_ids.indexOf(card.id) + 1} /{" "}
                    {session.config.card_ids.length}
                  </span>
                </div>
                <h2
                  ref={heading}
                  tabIndex={-1}
                  className="mt-6 text-[30px] leading-tight font-bold tracking-[-0.03em] text-balance break-words outline-none"
                >
                  {card.front}
                </h2>
              </div>
              <p role="status" aria-live="polite" className="sr-only">
                {announcement}
              </p>
              {session.config.mode === "study" ? (
                flipped ? (
                  <>
                    {model}
                    {answer.trim() && (
                      <div>
                        <h3 className="font-semibold">Your answer</h3>
                        <p className="whitespace-pre-wrap">{answer}</p>
                      </div>
                    )}
                    {ratingControls}
                  </>
                ) : (
                  <>
                    {answerInput}
                    <Button
                      className="mt-7 h-11 w-full"
                      disabled={busy}
                      onClick={() => {
                        stopSpeech();
                        setFlipped(true);
                      }}
                    >
                      <PortalIcon name="refresh-cw" />
                      Flip card
                    </Button>
                  </>
                )
              ) : verdict ? (
                <>
                  <Badge
                    variant={
                      verdict.mark === 1
                        ? "success"
                        : verdict.mark === 0.5
                          ? "warning"
                          : "destructive"
                    }
                  >
                    {verdict.mark === 1 ? (
                      <Check />
                    ) : verdict.mark === 0.5 ? (
                      <Minus />
                    ) : (
                      <Close />
                    )}
                    {verdict.mark === 1
                      ? "Knew it"
                      : verdict.mark === 0.5
                        ? "Mostly"
                        : "Not yet"}
                  </Badge>
                  <p>{verdict.reason}</p>
                  {model}
                  <div>
                    <h3 className="font-semibold">Your answer</h3>
                    <p className="whitespace-pre-wrap">
                      {answer || "Not answered"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    aria-expanded={disagree}
                    onClick={() => setDisagree((v) => !v)}
                  >
                    Disagree?
                  </Button>
                  {disagree && ratingControls}
                  <Button
                    disabled={busy}
                    onClick={() => act(() => advance(verdict.mark))}
                  >
                    Next card
                  </Button>
                </>
              ) : flipped || failedCheck ? (
                <>
                  {model}
                  {ratingControls}
                </>
              ) : (
                <>
                  {answerInput}
                  <Button
                    className="mt-7 h-11 w-full"
                    disabled={busy}
                    onClick={() => {
                      stopSpeech();
                      setFlipped(true);
                    }}
                  >
                    <PortalIcon name="refresh-cw" />
                    Flip card
                  </Button>
                </>
              )}
              {speechNote && (
                <p role="status" className="text-muted-foreground text-sm">
                  {speechNote}
                </p>
              )}
              {!verdict && (
                <Button
                  aria-label="Skip (S)"
                  className="text-muted-foreground mt-1.5 h-8 w-full text-[13px]"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act(skip)}
                >
                  Skip <Kbd>S</Kbd>
                </Button>
              )}
            </Card>
          </article>
        ) : (
          <Card className="p-5">
            <h2>All cards reviewed</h2>
            {finished ? (
              <p role="status">Loading your results…</p>
            ) : (
              <Button disabled={busy} onClick={() => act(finish)}>
                See results
              </Button>
            )}
          </Card>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
      <Dialog
        open={error.includes("sign-in expired")}
        onOpenChange={(open) => {
          if (!open) setError("");
        }}
      >
        <DialogContent>
          <DialogTitle>Sign in to continue</DialogTitle>
          <p>Your answer is saved in this browser.</p>
          <Button render={<Link href="/sign-in" />}>Sign in</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={exit} onOpenChange={setExit}>
        <DialogContent>
          <DialogTitle>Save and exit?</DialogTitle>
          <p>You can continue this deck from Home.</p>
          <Button onClick={() => setExit(false)} variant="outline">
            Keep working
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              act(async () => {
                stopSpeech();
                await saveTime();
                router.push("/student/flashcards");
              })
            }
          >
            Save and exit
          </Button>
        </DialogContent>
      </Dialog>
    </SessionShell>
  );
}
