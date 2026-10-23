"use client";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
} from "@/components/claro/controls";
import { Camera, Spinner } from "@/components/icons";
import { useScanToText, type ScanResult } from "@/hooks/use-scan-to-text";
import { capWords } from "@/lib/limits";

const TYPE_MS = 1500;
const TICK_MS = 30;
const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** "Scan written answer": reads a photo into the typed answer box. The photo is never stored. */
export function ScanToText({
  attemptId,
  value,
  onText,
  onBusy,
  disabled = false,
}: {
  attemptId: string;
  value: string;
  onText: (text: string) => void;
  /** Lets the parent lock the answer box and navigation while a scan is running. */
  onBusy?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const { scan, state, error, retryAt } = useScanToText(attemptId);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ScanResult | null>(null);
  const [typing, setTyping] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const finish = useRef<(() => void) | null>(null);
  const write = useRef(onText);
  const latest = useRef(value);
  useEffect(() => {
    write.current = onText;
    latest.current = value;
  });

  // Never leave a half-typed answer behind: finish the text if unmounted mid-reveal.
  useEffect(() => () => finish.current?.(), []);
  useEffect(() => {
    if (retryAt <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), retryAt - now);
    return () => clearTimeout(timer);
  }, [retryAt, now]);

  function reveal(scanned: ScanResult, base: string) {
    const full = capWords(base + scanned.text);
    setResult(scanned);
    if (reducedMotion() || full.length <= base.length) {
      write.current(full);
      return;
    }
    setTyping(true);
    const step = Math.max(
      1,
      Math.ceil((full.length - base.length) / (TYPE_MS / TICK_MS)),
    );
    let shown = base.length;
    const timer = setInterval(() => {
      shown = Math.min(full.length, shown + step);
      write.current(full.slice(0, shown));
      if (shown >= full.length) done();
    }, TICK_MS);
    function done() {
      clearInterval(timer);
      finish.current = null;
      setTyping(false);
    }
    finish.current = () => {
      done();
      write.current(full);
    };
  }

  async function choose(file: File) {
    setResult(null);
    const scanned = await scan(file);
    if (!scanned) return;
    if (latest.current.trim()) setPending(scanned);
    else reveal(scanned, "");
  }

  const busy = state === "preparing" || state === "reading" || typing;
  const reportBusy = useRef(onBusy);
  useEffect(() => {
    reportBusy.current = onBusy;
  });
  useEffect(() => {
    if (!busy) return;
    reportBusy.current?.(true);
    return () => reportBusy.current?.(false);
  }, [busy]);
  const waiting = retryAt > now;
  const status =
    state === "preparing"
      ? "Preparing your photo…"
      : state === "reading"
        ? "Reading your handwriting…"
        : typing
          ? "Typing your answer…"
          : "";

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void choose(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || busy || waiting}
        aria-busy={busy || undefined}
        onClick={() => input.current?.click()}
      >
        {busy ? <Spinner className="animate-spin" /> : <Camera />}
        Scan written answer
      </Button>
      <p role="status" className="text-muted-foreground text-sm">
        {status}
        {!busy && !!result?.uncertain && "Check any words marked [?]."}
      </p>
      {!busy && result?.notes && (
        <p className="text-muted-foreground text-sm">{result.notes}</p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm break-words">
          {error}
        </p>
      )}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Your answer box already has text</AlertDialogTitle>
          <AlertDialogDescription>
            Replace it with the scanned answer, or add the scan below it.
          </AlertDialogDescription>
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const scanned = pending!;
                setPending(null);
                reveal(scanned, `${latest.current.trimEnd()}\n\n`);
              }}
            >
              Add below
            </Button>
            <Button
              onClick={() => {
                const scanned = pending!;
                setPending(null);
                reveal(scanned, "");
              }}
            >
              Replace
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
