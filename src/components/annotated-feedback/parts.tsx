import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  uncertainParts,
  TAGS,
  type FeedbackComment,
  type NumberedComment,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { PenTick, PenCaret } from "../claro/markup-answer";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

/** Opens and closes like <details>, remembering the choice per browser. */
export function FeedbackDetails({
  name,
  title,
  children,
}: {
  name: string;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const key = `claro-feedback-${name}`;
  useEffect(() => {
    try {
      if (ref.current) ref.current.open = localStorage.getItem(key) === "1";
    } catch {
      /* Keep the default when browser storage is unavailable. */
    }
  }, [key]);
  return (
    <details
      ref={ref}
      className="group bg-card rounded-xl border"
      onToggle={(e) => {
        try {
          localStorage.setItem(key, e.currentTarget.open ? "1" : "0");
        } catch {
          /* The control still works without persisted preferences. */
        }
      }}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        {title}
      </summary>
      <div className="px-4 pb-4 text-sm">{children}</div>
    </details>
  );
}

export type EditableComment = FeedbackComment & { id: number };
let commentDeletionCount = 0;
export type FeedbackEdit = {
  comments: EditableComment[];
  nextMark: string;
  onChange: (comments: EditableComment[], nextMark: string) => void;
  disabled?: boolean;
  onUndo: (deleted?: EditableComment) => void;
  onDeleteToast?: (commentId: number, toastId: string) => void;
};

export function CommentFields({
  value,
  onChange,
}: {
  value: FeedbackComment;
  onChange: (value: FeedbackComment) => void;
}) {
  return (
    <div
      className="mt-2 grid gap-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          Kind
          <select
            className="bg-card h-9 rounded-md border px-2"
            value={value.kind}
            onChange={(e) =>
              onChange({
                ...value,
                kind: e.target.value as FeedbackComment["kind"],
                next_mark:
                  e.target.value === "strength" ? null : value.next_mark,
              })
            }
          >
            <option value="strength">Strength</option>
            <option value="fix">Fix</option>
          </select>
        </label>
        <label className="grid gap-1">
          Tag
          <select
            className="bg-card h-9 rounded-md border px-2"
            value={value.tag ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                tag: e.target.value as FeedbackComment["tag"],
              })
            }
          >
            {!value.tag && (
              <option value="" disabled>
                Choose tag
              </option>
            )}
            {TAGS.map((tag) => (
              <option key={tag}>{tag}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1">
        Comment
        <Textarea
          value={value.body}
          maxLength={4000}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
        />
      </label>
      {value.kind === "fix" && (
        <label className="grid gap-1">
          Next mark
          <Textarea
            value={value.next_mark ?? ""}
            maxLength={4000}
            onChange={(e) =>
              onChange({ ...value, next_mark: e.target.value || null })
            }
          />
        </label>
      )}
    </div>
  );
}

export function CommentCard({
  c,
  active,
  className,
  edit,
  ...props
}: {
  c: NumberedComment;
  active?: boolean;
  edit?: FeedbackEdit;
} & React.ComponentProps<"div">) {
  const { n, ...comment } = c;
  const strength = c.kind === "strength";
  const Icon = strength ? PenTick : PenCaret;
  return (
    <div
      data-card={c.id}
      tabIndex={-1}
      className={cn(
        "rounded-xl border p-3 text-sm transition-shadow outline-none",
        "bg-card",
        active && "ring-ink/40 ring-2",
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
            strength
              ? "bg-success-soft text-success"
              : "bg-destructive-soft text-destructive",
          )}
        >
          {n}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
            strength
              ? "border-success/25 text-success"
              : "border-destructive/25 text-destructive",
          )}
        >
          <Icon
            aria-hidden
            className={cn(
              "size-4",
              strength ? "text-success" : "text-destructive",
            )}
          />
          {strength ? "Strength" : "Fix"}
        </span>
        {c.tag && <Badge variant="outline">{c.tag}</Badge>}
      </div>
      {edit ? (
        <fieldset disabled={edit.disabled}>
          <CommentFields
            value={comment}
            onChange={(value) =>
              edit.onChange(
                edit.comments.map((item) =>
                  item.id === c.id ? { ...value, id: c.id } : item,
                ),
                edit.nextMark,
              )
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            aria-label={`Delete comment ${n}`}
            onClick={(e) => {
              e.stopPropagation();
              edit.onChange(
                edit.comments.filter((item) => item.id !== c.id),
                edit.nextMark,
              );
              const toastId = `deleted-comment-${c.id}-${++commentDeletionCount}`;
              edit.onDeleteToast?.(c.id, toastId);
              toast("Comment deleted", {
                id: toastId,
                duration: 10000,
                action: {
                  label: "Undo",
                  onClick: () => edit.onUndo(comment),
                },
              });
            }}
          >
            Delete
          </Button>
        </fieldset>
      ) : (
        <p className="mt-1.5">{c.body}</p>
      )}
    </div>
  );
}

export function Uncertain({ text }: { text: string }) {
  return uncertainParts(text).map((p, i) =>
    p.uncertain ? (
      <span
        key={i}
        title="Hard to read. Not counted against you."
        className="decoration-warning underline decoration-dotted decoration-2 underline-offset-4"
      >
        {p.text}
      </span>
    ) : (
      p.text
    ),
  );
}

export function Photos({ photos }: { photos: string[] }) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [big, setBig] = useState(false);
  return (
    <div className="space-y-2">
      {photos.length > 1 && (
        <div className="flex gap-1" role="tablist" aria-label="Photo pages">
          {photos.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={page === i}
              className={cn(
                buttonVariants({ variant: "outline", size: "xs" }),
                page === i && "border-ink",
              )}
              onClick={() => setPage(i)}
            >
              Page {i + 1}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="block w-full overflow-hidden rounded-xl border"
        onClick={() => setZoom(page)}
        aria-label={`Open page ${page + 1} full screen`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        <img
          src={photos[page]}
          alt={`Your answer, page ${page + 1}`}
          className="max-h-[70vh] w-full object-contain"
        />
      </button>
      <Dialog
        open={zoom !== null}
        onOpenChange={(open) => !open && setZoom(null)}
      >
        <DialogContent className="h-[90vh] max-w-[calc(100%-2rem)] grid-rows-[auto_1fr] sm:max-w-5xl">
          <DialogTitle>Page {(zoom ?? 0) + 1}</DialogTitle>
          <div className="overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            <img
              src={photos[zoom ?? 0]}
              alt={`Your answer, page ${(zoom ?? 0) + 1}, zoomed`}
              onClick={() => setBig(!big)}
              className={cn(
                "max-w-none cursor-zoom-in",
                big ? "w-[200%] cursor-zoom-out" : "w-full",
              )}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ResultAnswerCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-card shadow-card min-w-0 space-y-4 rounded-xl border p-5">
      {children}
    </section>
  );
}
