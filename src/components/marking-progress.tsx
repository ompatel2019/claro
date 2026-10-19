"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const REFRESH_MS = 2000;
export const SLOW_REFRESH_MS = 5000;
export const MAX_WAIT_MS = 10 * 60_000;
export const FINALISE_AFTER_MS = 15_000;

/** Delay before the next refresh, or null once we should stop polling. */
export function nextRefreshDelay(waited: number) {
  if (waited > MAX_WAIT_MS) return null;
  return waited > 30_000 ? SLOW_REFRESH_MS : REFRESH_MS;
}

/**
 * §3.4 marking progress: re-renders the page every 2 s (5 s after 30 s, stopping after
 * 10 min). With `inProgress` (the page is still the "Marking in progress" card because
 * finished_at is unset) it keeps refreshing even when no answer is still marking, refreshes
 * at once when everything is marked, and after 15 s of all-marked-but-unfinished it asks the
 * server to finish the session itself (the marking tab may have been closed).
 */
export function MarkingProgress({
  done,
  total,
  marking,
  attention,
  inProgress = false,
  sessionId,
}: {
  done: number;
  total: number;
  marking: number;
  attention: number;
  inProgress?: boolean;
  sessionId?: string;
}) {
  const router = useRouter();
  const active = marking > 0;
  const allMarked = marking === 0 && total > 0 && done >= total;
  const poll = active || inProgress;
  useEffect(() => {
    if (!poll) return;
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const delay = nextRefreshDelay(Date.now() - start);
      if (delay == null) return;
      timer = setTimeout(() => {
        router.refresh();
        tick();
      }, delay);
    };
    tick();
    return () => clearTimeout(timer);
  }, [poll, router]);

  // Everything marked: refresh straight away rather than waiting for the next tick.
  useEffect(() => {
    if (inProgress && allMarked) router.refresh();
  }, [inProgress, allMarked, router]);

  // Marking tab closed: nothing else will set finished_at, so finish it from here (once).
  useEffect(() => {
    if (!inProgress || !allMarked || !sessionId) return;
    const timer = setTimeout(() => {
      fetch(`/api/sessions/${sessionId}/finish`, { method: "POST" })
        .catch(() => undefined)
        .finally(() => router.refresh());
    }, FINALISE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [inProgress, allMarked, sessionId, router]);

  const status = (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {done} of {total} marked
      {attention ? ` · ${attention} need attention` : ""}.{" "}
      {active ? `${marking} still marking.` : "Marking complete."}
    </p>
  );
  // Fully marked: nothing to show, but the live region stays to announce completion.
  if (!active && !attention && !inProgress) return status;
  return (
    <div className="bg-card space-y-2 rounded-xl border p-4">
      {status}
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-medium">
          {done} of {total} marked
          {attention > 0 ? ` · ${attention} need attention` : ""}
        </span>
        {active && (
          <span className="text-muted-foreground">
            You can leave this page. We’ll keep marking.
          </span>
        )}
        {!active && inProgress && (
          <span className="text-muted-foreground">Finishing your results…</span>
        )}
      </div>
      {active && (
        <div
          role="progressbar"
          aria-label="Marking progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="bg-muted h-2 overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full transition-all"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      )}
    </div>
  );
}
