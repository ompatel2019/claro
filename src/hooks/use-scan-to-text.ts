"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureSession } from "@/lib/auth-client";
import { SCAN_PHOTO_BYTE_LIMIT } from "@/lib/limits";
import { createClient } from "@/utils/supabase/client";

export type ScanState = "idle" | "preparing" | "reading" | "done" | "error";
export type ScanResult = { text: string; uncertain: number; notes: string };

export const SCAN_LONG_EDGE = 2048;
const TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const HEIC = /\.hei[cf]$/i;

export const SCAN_ERRORS = {
  type: "Choose a JPEG, PNG, WebP or HEIC photo.",
  large: "That photo is too large.",
  heic: "This browser couldn't open your HEIC photo. Export it as JPEG, PNG or WebP and try again.",
  signIn: "Sign in again to scan.",
  notFound: "Couldn't scan this answer. Refresh the page.",
  locked: "This answer can't be changed now.",
  unreadable:
    "We couldn't read any writing in that photo. Try a clearer, well-lit photo or type your answer.",
  paused: "Scanning is paused right now. You can still type your answer.",
  failed: "Couldn't read your photo. Try again.",
} as const;

class ScanError extends Error {}

/** Shrink to a 2048 px long edge as JPEG; HEIC is converted here because the route only takes JPEG, PNG or WebP. */
export async function prepareScan(file: File): Promise<Blob> {
  const heic = /^image\/hei[cf]$/.test(file.type) || HEIC.test(file.name);
  if (!TYPES.includes(file.type) && !heic)
    throw new ScanError(SCAN_ERRORS.type);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ScanError(heic ? SCAN_ERRORS.heic : SCAN_ERRORS.type);
  }
  const scale = Math.min(
    1,
    SCAN_LONG_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new ScanError(SCAN_ERRORS.failed);
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw new ScanError(heic ? SCAN_ERRORS.heic : SCAN_ERRORS.failed);
  if (blob.size > SCAN_PHOTO_BYTE_LIMIT) throw new ScanError(SCAN_ERRORS.large);
  return blob;
}

function messageFor(status: number, body: { error?: unknown }) {
  if (status === 401) return SCAN_ERRORS.signIn;
  if (status === 404) return SCAN_ERRORS.notFound;
  if (status === 409) return SCAN_ERRORS.locked;
  if (status === 400) return SCAN_ERRORS.type;
  if (status === 413) return SCAN_ERRORS.large;
  if (status === 422) return SCAN_ERRORS.unreadable;
  if (status === 503) return SCAN_ERRORS.paused;
  if (status === 429 && typeof body.error === "string") return body.error;
  return SCAN_ERRORS.failed;
}

/** Photo to typed text via POST /api/attempts/[id]/scan. Nothing is stored; aborted when the attempt changes or on unmount. */
export function useScanToText(attemptId: string) {
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (!controller.current) return;
    controller.current.abort();
    controller.current = null;
    setState("idle");
  }, []);
  useEffect(() => cancel, [attemptId, cancel]);

  const scan = useCallback(
    async (file: File): Promise<ScanResult | null> => {
      cancel();
      const abort = new AbortController();
      controller.current = abort;
      setError("");
      setState("preparing");
      try {
        const photo = await prepareScan(file);
        abort.signal.throwIfAborted();
        setState("reading");
        const send = () => {
          const body = new FormData();
          body.append("file", photo, "scan.jpg");
          return fetch(`/api/attempts/${attemptId}/scan`, {
            method: "POST",
            body,
            signal: abort.signal,
          });
        };
        let response = await send();
        if (response.status === 401) {
          try {
            await ensureSession(createClient());
          } catch {
            throw new ScanError(SCAN_ERRORS.signIn);
          }
          abort.signal.throwIfAborted();
          response = await send();
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 429)
            setRetryAt(
              Date.now() +
                (Number(response.headers.get("Retry-After")) || 60) * 1000,
            );
          throw new ScanError(messageFor(response.status, body));
        }
        if (controller.current !== abort) return null;
        controller.current = null;
        setState("done");
        return {
          text: String(body.text ?? ""),
          uncertain: Number(body.uncertain) || 0,
          notes: typeof body.notes === "string" ? body.notes : "",
        };
      } catch (cause) {
        if (abort.signal.aborted || controller.current !== abort) return null;
        controller.current = null;
        setError(
          cause instanceof ScanError ? cause.message : SCAN_ERRORS.failed,
        );
        setState("error");
        return null;
      }
    },
    [attemptId, cancel],
  );

  return { scan, state, error, retryAt, cancel };
}
