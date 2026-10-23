"use client";
import { useEffect, useRef } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
} from "@/components/claro/controls";

export const LEAVE_MESSAGE =
  "Leaving ends this sprint. Your answered questions will be marked.";

/**
 * Set when the student confirmed leaving by reload or tab close with answers still saving; the
 * next load saves them and ends the sprint (otherwise the 30-minute sweep ends it).
 */
export const leftKey = (sessionId: string) => `claro-left-${sessionId}`;

/** A same-tab, same-origin link click that would navigate away from the runner. */
export function leavingLink(event: MouseEvent, here: string) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !(event.target instanceof Element)
  )
    return false;
  const link = event.target.closest("a[href]");
  if (
    !(link instanceof HTMLAnchorElement) ||
    link.closest("[data-leave-ok]") ||
    link.hasAttribute("download") ||
    (link.target && link.target !== "_self")
  )
    return false;
  const to = new URL(link.href, here);
  const from = new URL(here);
  return (
    to.origin === from.origin &&
    (to.pathname !== from.pathname || to.search !== from.search)
  );
}

/**
 * No resume: while a sprint is active, leaving asks first and confirming finishes it. Covers the
 * exit button (via `onAsk`), in-app links, browser back, and reload or tab close (the browser's own
 * prompt). A confirmed unload finishes the sprint with a beacon once every answer is saved; with
 * answers still saving it never finishes early (that would mark stale text) and leaves a flag instead.
 */
export function useLeaveGuard({
  sessionId,
  active,
  onAsk,
  unsaved,
}: {
  sessionId: string;
  active: boolean;
  onAsk: () => void;
  unsaved: () => boolean;
}) {
  const ask = useRef(onAsk);
  const pending = useRef(unsaved);
  const guarded = useRef(false);
  useEffect(() => {
    ask.current = onAsk;
    pending.current = unsaved;
  });
  useEffect(() => {
    if (!active) return;
    const finishUrl = `/api/sessions/${sessionId}/finish`;
    const click = (event: MouseEvent) => {
      if (!leavingLink(event, window.location.href)) return;
      event.preventDefault();
      event.stopPropagation();
      ask.current();
    };
    // Back/forward: keep a duplicate entry on top so leaving can be confirmed first.
    if (!guarded.current) {
      guarded.current = true;
      window.history.pushState(window.history.state, "", window.location.href);
    }
    const pop = () => {
      window.history.pushState(window.history.state, "", window.location.href);
      ask.current();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const pageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      if (!pending.current()) {
        navigator.sendBeacon?.(finishUrl);
        return;
      }
      try {
        sessionStorage.setItem(leftKey(sessionId), "1");
      } catch {}
    };
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", pageHide);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", pageHide);
    };
  }, [active, sessionId]);
}

export function LeaveSprintDialog({
  open,
  onOpenChange,
  busy,
  onLeave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onLeave: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle className="text-base font-semibold">
          Leave this sprint?
        </AlertDialogTitle>
        <AlertDialogDescription className="text-muted-foreground">
          {LEAVE_MESSAGE}
        </AlertDialogDescription>
        <AlertDialogFooter className="flex-wrap">
          <AlertDialogCancel>Keep working</AlertDialogCancel>
          <Button disabled={busy} onClick={onLeave}>
            Leave and mark
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
