"use client";
import { FormSelect } from "@/components/ui/form-select";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { undoFeedback } from "@/app/admin/feedback/actions";
import { updateStudentFeedback } from "@/app/admin/students/actions";
import { safeLocalPath } from "@/lib/students";
import { SpotCheck } from "./student-actions";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export type FeedbackDetailRow = {
  id: string;
  user_id: string;
  message: string;
  status: "new" | "triaged" | "resolved";
  admin_note: string | null;
  page_path: string | null;
  user_agent: string | null;
  question_id: string | null;
  session_id: string | null;
};
/** Full feedback context and its one admin reply/status write path (§4.10). */
export function FeedbackDetail({
  row,
  photos,
  missingScreenshots = 0,
  attempt,
  draftKey,
}: {
  row: FeedbackDetailRow;
  photos: string[];
  missingScreenshots?: number;
  draftKey?: string;
  attempt?: { id: string; status: string } | null;
}) {
  const [status, setStatus] = useState(row.status);
  const [reply, setReply] = useState(row.admin_note ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const page = safeLocalPath(row.page_path);
  useEffect(() => {
    if (!draftKey) return;
    const timer = window.setTimeout(() => {
      try {
        const draft = localStorage.getItem(draftKey);
        if (draft !== null) setReply(draft.slice(0, 2000));
      } catch {
        /* Storage is optional. */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftKey]);
  function save(resolve: boolean) {
    start(async () => {
      setError(null);
      try {
        const result = await updateStudentFeedback(
          row.id,
          row.user_id,
          resolve ? "resolved" : status,
          reply,
        );
        if (resolve) setStatus("resolved");
        if (draftKey) {
          try {
            localStorage.removeItem(draftKey);
          } catch {
            /* Storage is optional. */
          }
        }
        toast.success("Feedback saved", {
          duration: 4000,
          action: {
            label: "Undo",
            onClick: () =>
              start(async () => {
                try {
                  const undone = await undoFeedback(result.undo);
                  if ("error" in undone) {
                    setError(undone.error);
                    return;
                  }
                  const restored = undone.restored.find((r) => r.id === row.id);
                  if (restored) {
                    setStatus(restored.status);
                    setReply(restored.admin_note ?? "");
                  }
                  toast.success("Feedback change undone");
                } catch {
                  setError("Couldn't undo this. Try again.");
                }
              }),
          },
        });
      } catch {
        setError("Couldn't save this. Try again.");
      }
    });
  }
  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Student message</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="break-words whitespace-pre-wrap">{row.message}</p>
        </CardContent>
      </Card>
      {!!photos.length && (
        <section className="space-y-2" aria-labelledby="feedback-screenshots">
          <h3 id="feedback-screenshots" className="text-sm font-semibold">
            Screenshots
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((url, i) => (
              <button
                key={url}
                type="button"
                className="bg-muted hover:border-foreground/30 relative aspect-[4/3] overflow-hidden rounded-xl border transition-colors"
                onClick={() => setPhoto(url)}
                aria-label={`Screenshot ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Signed private screenshots are not image-optimiser inputs. */}
                <img src={url} alt="" className="size-full object-cover" />
                <span className="bg-card absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-xs font-medium">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {missingScreenshots > 0 && (
        <p className="text-muted-foreground text-sm">
          {missingScreenshots}{" "}
          {missingScreenshots === 1 ? "screenshot is" : "screenshots are"} no
          longer available.
        </p>
      )}
      <Dialog open={!!photo} onOpenChange={(open) => !open && setPhoto(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogTitle>Screenshot</DialogTitle>
          {/* Signed private storage URLs; natural dimensions preserve screenshot detail. */}
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- Private screenshots retain their original dimensions.
            <img
              src={photo}
              alt="Student feedback screenshot"
              className="max-h-[75vh] max-w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {page && (
            <Link href={page} className="block break-all underline">
              Page: {page}
            </Link>
          )}
          <p className="text-muted-foreground text-xs break-all">
            User agent: {row.user_agent || "Not supplied"}
          </p>
          <div className="flex flex-wrap gap-2">
            {row.question_id && (
              <Link
                href={`/admin/content/questions/${encodeURIComponent(row.question_id)}`}
                className="underline"
              >
                Open in editor
              </Link>
            )}
            {row.session_id && (
              <Link
                href={`/admin/students/${row.user_id}?tab=sessions&session=${row.session_id}`}
                className="underline"
              >
                Open report
              </Link>
            )}
            {attempt?.status === "marked" && (
              <SpotCheck attemptId={attempt.id} />
            )}
          </div>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Triage and reply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="grid gap-1 text-sm font-medium">
            Status
            <FormSelect
              aria-label="Status"
              value={status}
              disabled={pending}
              onValueChange={(value) => setStatus(value as typeof status)}
              options={[
                { value: "new", label: "New" },
                { value: "triaged", label: "Triaged" },
                { value: "resolved", label: "Resolved" },
              ]}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Reply to student
            <span className="text-muted-foreground text-xs font-normal">
              Shown on their profile. Maximum 2,000 characters.
            </span>
            <Textarea
              aria-label="Reply to student"
              maxLength={2000}
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                if (draftKey) {
                  try {
                    localStorage.setItem(draftKey, e.target.value);
                  } catch {
                    /* Storage is optional. */
                  }
                }
              }}
              disabled={pending}
            />
            <span className="text-muted-foreground text-right text-xs font-normal tabular-nums">
              {reply.length}/2,000
            </span>
          </label>
          {error && (
            <p
              role="alert"
              className="bg-destructive-soft text-destructive rounded-lg p-3 text-sm"
            >
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => save(false)}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button disabled={pending} onClick={() => save(true)}>
              Resolve
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
